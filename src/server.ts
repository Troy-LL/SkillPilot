import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import type { SkillingConfig } from './config.js';
import { MAX_SELECT_INPUT_CHARS } from './constants.js';
import { SkillingError, errorPayload, type SkillingErrorCode } from './errors.js';
import { logPromptSnippet, logToolError, logToolOk } from './observability.js';
import { PACKAGE_VERSION } from './package-version.js';
import { getSelector } from './selector/index.js';
import {
  beginTask,
  endTask,
  estimateShapedInjectTokens,
  getSession,
  loadSkillEpisode,
  resolveRepoRootFromSkillRoot,
  runCleanup,
  validateSkillIdForLoad,
} from './task-lifecycle.js';
import { BOOTSTRAP_SKILL_IDS, ensureBootstrapCatalog } from './catalog-bootstrap.js';
import { formatIndexError, getSkillIndex } from './store.js';
import { requireNonEmptyTrimmed } from './validate.js';

type ToolResult = ReturnType<typeof toolOk>;

const LOW_LEVEL_TOOL_NOTE = ' Low-level tool — use for debugging or custom flows, not routine work.';

const SERVER_INSTRUCTIONS = `Skilling is a portable context engine for AI coding agents. It shapes skill bodies to a token budget, injects them into task sessions, and evicts on end_task with a usage summary.

Typical multi-stage flow:
1. begin_task(phase: plan, prompt: goal) — auto-picks planning skill when skill_id omitted
2. Follow shaped body; end_task when plan stage is done
3. begin_task(phase: implement, prompt: goal) — auto-picks implementation skill
4. Follow body; end_task between stages; end_task(finalize: true) when done — returns usage_summary (what/where/why per skill)

Empty project catalog: list still works — bootstrap seeds find-skills and orchestrator. Never stop because the folder looks empty; use phase: discovery or begin_task(skill_id: find-skills, token_budget: 300) to install more skills.

Session SOT: .skilling/session.json and .skilling/active-body.md. Call get_session before begin_task if unsure.

On errors: STORE_UNAVAILABLE → health then npx skilling setup --force.

Fetch the skilling_workflow prompt for the full lifecycle procedure.`;

const SKILLING_WORKFLOW_PROMPT = `# Skilling task lifecycle

## Procedure

1. **Plan:** \`begin_task(phase: plan, prompt: goal)\` — omit skill_id; server auto-picks. Follow **body** → \`end_task\` when planning is done.
2. **Implement:** \`begin_task(phase: implement, prompt: goal)\` — auto-pick or explicit skill_id. Follow **body** → \`end_task\` when the overall task is complete.
3. **Discovery** (empty catalog): \`begin_task(phase: discovery)\` or \`skill_id: find-skills\`, \`token_budget: 300\`.
4. **list** seeds bootstrap skills if the folder looked empty — never stop because the catalog is empty.

Optional: **suggest_skills** for ranked hints without inject.

## Budget ladder

| Stage | token_budget | Typical inject |
|-------|--------------|----------------|
| discovery / plan | 300 | summary |
| implement | 900 | compact |

## User-facing presentation

- After begin_task: reply with **one sentence** using \`summary\` from the tool or session.
- **Never** show \`candidates\`, skill menus, raw score tables, or \`list\` output to the user unless they asked.

## End or switch tasks

- **end_task** when a stage or the whole task is done — returns **usage_summary** (what skill, where in workflow, why).
- \`end_previous: true\` (default) ends prior stage usage entries when starting the next phase.
- Do not read \`.agents/skills/\` directly when MCP tools are available (except \`.skilling/active-body.md\` bridge).

## Do not

- Abandon work because **list** returned zero skills before bootstrap.
- Skip **end_task** when moving to unrelated work.`;

function toolError(code: SkillingErrorCode, message: string) {
  const payload = errorPayload(code, message);
  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toolOk(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function handleError(tool: string, e: unknown) {
  if (e instanceof SkillingError) {
    logToolError(tool, e.code, { message: e.message });
    return toolError(e.code, e.message);
  }
  const message = e instanceof Error ? e.message : String(e);
  logToolError(tool, 'SELECTOR_ERROR', { message });
  return toolError('SELECTOR_ERROR', message);
}

const selectInputSchema = {
  goal: z.string().optional().describe('Task goal for skill matching'),
  prompt: z
    .string()
    .optional()
    .describe('Legacy alias for goal (select compat) — provide goal or prompt'),
  context: z.string().optional().describe('Optional extra context merged into matching'),
  client: z.string().optional().describe('Optional host hint (e.g. cursor)'),
  workspace_path: z.string().optional().describe('Optional workspace path for keyword context'),
  select_max_tokens: z
    .number()
    .int()
    .optional()
    .describe('Optional cap on metadata token_estimate when ranking — omit to allow any skill'),
  token_budget: z
    .number()
    .int()
    .optional()
    .describe('Deprecated alias for select_max_tokens — does not affect inject shaping'),
  top_k: z.number().int().optional().describe('Return up to N ranked candidates (default 5)'),
};

function resolveSuggestGoal(input: z.infer<z.ZodObject<typeof selectInputSchema>>): string {
  return (input.goal?.trim() || input.prompt?.trim() || '').trim();
}

function resolveSelectMaxTokens(
  input: z.infer<z.ZodObject<typeof selectInputSchema>>,
): number | undefined {
  return input.select_max_tokens ?? input.token_budget;
}

function enrichSuggestResult(
  metas: Map<string, import('./parse.js').SkillFrontMatter>,
  result: import('./selector/types.js').SelectResult,
) {
  const ranked =
    result.candidates ??
    (result.skill_id
      ? [{ skill_id: result.skill_id, confidence: result.confidence }]
      : []);

  const candidates = ranked.map((entry) => {
    const meta = metas.get(entry.skill_id);
    return {
      skill_id: entry.skill_id,
      confidence: entry.confidence,
      summary: meta?.summary ?? '',
      token_estimate_meta: meta?.token_estimate ?? 0,
    };
  });

  return {
    skill_id: result.skill_id,
    confidence: result.confidence,
    rationale: result.rationale,
    candidates,
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
  };
}

async function runSuggest(
  rootDisplay: string,
  config: SkillingConfig,
  input: z.infer<z.ZodObject<typeof selectInputSchema>>,
  toolName: string,
): Promise<ToolResult> {
  const start = Date.now();
  const trimmedGoal = resolveSuggestGoal(input);
  if (!trimmedGoal) {
    return toolError('VALIDATION_ERROR', 'suggest_skills requires a non-empty goal or prompt.');
  }
  logPromptSnippet(toolName, trimmedGoal);
  const promptLen = Math.max(input.prompt?.length ?? 0, input.goal?.length ?? 0);
  if (promptLen > MAX_SELECT_INPUT_CHARS) {
    return toolError(
      'VALIDATION_ERROR',
      `goal and prompt must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`,
    );
  }
  const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
  if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
  const selector = getSelector(config);
  const result = selector.select([...index.metas.values()], {
    prompt: trimmedGoal,
    context: input.context?.trim(),
    client: input.client?.trim(),
    workspace_path: input.workspace_path?.trim(),
    select_max_tokens: resolveSelectMaxTokens(input),
    top_k: input.top_k ?? 5,
  });
  const payload = enrichSuggestResult(index.metas, result);
  logToolOk(toolName, { skill_id: payload.skill_id ?? undefined, duration_ms: Date.now() - start });
  return toolOk(payload as unknown as Record<string, unknown>);
}

async function runList(
  rootDisplay: string,
  config: SkillingConfig,
  repoRoot: string,
  tags?: string[],
): Promise<ToolResult> {
  const { seeded } = ensureBootstrapCatalog(repoRoot);
  const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
  if (!index.ok) {
    return toolOk({
      skills: [],
      catalog_status: 'unavailable',
      bootstrap_skill_ids: [...BOOTSTRAP_SKILL_IDS],
      seeded,
      error: formatIndexError(index),
      message:
        'Skill catalog is not ready. Run npx skilling setup --force, then begin_task(phase: discovery) or begin_task(skill_id: find-skills, token_budget: 300). Do not stop — install skills and continue.',
      setup_hint: 'npx skilling setup --force',
    });
  }
  let skills = index.skills;
  if (tags?.length) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    skills = skills.filter((s) => s.tags?.some((t) => tagSet.has(t.toLowerCase())));
  }
  if (skills.length === 0) {
    logToolOk('skill_list', { count: 0, catalog_status: 'empty' });
    return toolOk({
      skills: [],
      catalog_status: 'empty',
      bootstrap_skill_ids: [...BOOTSTRAP_SKILL_IDS],
      seeded,
      message:
        'No additional skills installed yet. Call begin_task(phase: discovery) or begin_task(skill_id: find-skills, token_budget: 300) to add skills from the ecosystem. Bootstrap skills (find-skills, orchestrator) are available for planning and discovery.',
      setup_hint: 'npx skilling setup --force',
    });
  }
  logToolOk('skill_list', { count: skills.length });
  return toolOk({
    skills,
    catalog_status: 'ready',
    skill_count: skills.length,
    ...(seeded.length ? { seeded } : {}),
  });
}

async function runLoad(
  rootDisplay: string,
  config: SkillingConfig,
  skill_id: string,
  correlation_id?: string,
  inject_mode?: 'full' | 'summary' | 'compact' | 'sections',
  token_budget?: number,
): Promise<ToolResult> {
  const err = validateSkillIdForLoad(skill_id);
  if (err) return toolError('VALIDATION_ERROR', err);
  try {
    return toolOk(
      loadSkillEpisode(rootDisplay, skill_id, config, correlation_id, {
        inject_mode,
        token_budget,
      }) as unknown as Record<string, unknown>,
    );
  } catch (e) {
    return handleError('skill_inject', e);
  }
}

export function createSkillingServer(skillRoot: string, config: SkillingConfig): McpServer {
  const rootDisplay = path.resolve(skillRoot);
  const repoRoot = resolveRepoRootFromSkillRoot(rootDisplay);

  const mcp = new McpServer(
    {
      name: 'skilling',
      version: PACKAGE_VERSION,
      title: 'Skilling',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    },
  );

  const listHandler = async (input?: { tags?: string[] }) =>
    runList(rootDisplay, config, repoRoot, input?.tags);

  mcp.registerTool(
    'list',
    {
      description:
        'Tier-0 catalog: installed skills (id, title, summary, tags). Auto-seeds bootstrap skills if empty. catalog_status empty|ready — always continue with begin_task(phase: plan|discovery). ~280 tokens.',
      inputSchema: {
        tags: z
          .array(z.string())
          .optional()
          .describe('Optional tag filter — skills with any matching tag'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    listHandler,
  );

  mcp.registerTool(
    'skill_list',
    {
      description: 'Alias for list — enumerate installed skills (summaries only, no bodies).',
      inputSchema: {
        tags: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    listHandler,
  );

  const suggestHandler = async (input: z.infer<z.ZodObject<typeof selectInputSchema>>) => {
    try {
      return await runSuggest(rootDisplay, config, input, 'suggest_skills');
    } catch (e) {
      return handleError('suggest_skills', e);
    }
  };

  mcp.registerTool(
    'suggest_skills',
    {
      description:
        'Rank skill candidates for a goal using metadata only — never injects. Returns skill_id, confidence, candidates with summaries. Agent decides whether to call begin_task(skill_id). Never throws on low confidence.',
      inputSchema: selectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    suggestHandler,
  );

  const selectHandler = async (input: z.infer<z.ZodObject<typeof selectInputSchema>>) => {
    try {
      return await runSuggest(rootDisplay, config, input, 'select');
    } catch (e) {
      return handleError('select', e);
    }
  };

  mcp.registerTool(
    'select',
    {
      description:
        'Deprecated alias for suggest_skills — ranked candidates, no inject.' + LOW_LEVEL_TOOL_NOTE,
      inputSchema: selectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    selectHandler,
  );

  mcp.registerTool(
    'skill_select',
    {
      description: 'Deprecated alias for suggest_skills.' + LOW_LEVEL_TOOL_NOTE,
      inputSchema: selectInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    selectHandler,
  );

  mcp.registerTool(
    'skill_plan',
    {
      description:
        'DEPRECATED — prefer agent planning + suggest_skills + begin_task(skill_id). Returns ranked suggestions with per-suggestion inject_token_estimate; estimated_tokens is the primary included match only (one stage, not a sum).',
      inputSchema: {
        goal: z.string().describe('High-level task or goal'),
        context: z.string().optional(),
        max_skills: z.number().int().optional().describe('Max skills in suggestions (default 5)'),
        token_budget: z
          .number()
          .int()
          .optional()
          .describe('Budget for shaped inject estimates (default 900); per-suggestion inject_token_estimate uses this'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ goal, context, max_skills, token_budget }) => {
      try {
        const trimmedGoal = requireNonEmptyTrimmed(goal, 'skill_plan goal');
        const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
        if (!index.ok) return toolError('STORE_UNAVAILABLE', formatIndexError(index));
        logPromptSnippet('skill_plan', trimmedGoal);
        const selector = getSelector(config);
        const budget = token_budget ?? config.defaultTokenBudget;
        const plan = selector.plan([...index.metas.values()], {
          goal: trimmedGoal,
          context: context?.trim(),
          max_skills: max_skills ?? 5,
        });
        const suggestions = plan.suggestions.map((s) => ({
          ...s,
          inject_token_estimate: estimateShapedInjectTokens(
            rootDisplay,
            s.skill_id,
            config,
            budget,
          ),
        }));
        const primary =
          suggestions.find((s) => s.included) ?? suggestions[0];
        const estimated_tokens = primary?.inject_token_estimate ?? 0;
        logToolOk('skill_plan', { count: suggestions.length });
        return toolOk({
          deprecated: plan.deprecated,
          message: plan.message,
          skills_needed: plan.skills_needed,
          suggestions,
          confidence: plan.confidence,
          estimated_tokens,
        } as unknown as Record<string, unknown>);
      } catch (e) {
        return handleError('skill_plan', e);
      }
    },
  );

  const injectModeSchema = z.enum(['full', 'summary', 'compact', 'sections']);

  const loadHandler = async ({
    skill_id,
    correlation_id,
    inject_mode,
    token_budget,
  }: {
    skill_id: string;
    correlation_id?: string;
    inject_mode?: z.infer<typeof injectModeSchema>;
    token_budget?: number;
  }) => runLoad(rootDisplay, config, skill_id, correlation_id, inject_mode, token_budget);

  mcp.registerTool(
    'load',
    {
      description:
        'Load shaped injectable skill body. Returns token_estimate, ttl_hint, merge_hint.' +
        LOW_LEVEL_TOOL_NOTE,
      inputSchema: {
        skill_id: z.string(),
        correlation_id: z.string().optional(),
        inject_mode: injectModeSchema
          .optional()
          .describe('full | summary (~Tier1) | compact (no code blocks) | sections (headings only)'),
        token_budget: z
          .number()
          .int()
          .optional()
          .describe(
            'Inject shaping only: 300 discovery/plan, 900 implement (<350→summary, <900→compact). Does not filter skill selection.',
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    loadHandler,
  );

  mcp.registerTool(
    'skill_inject',
    {
      description:
        'Alias for load — inject skill body for current task.' + LOW_LEVEL_TOOL_NOTE,
      inputSchema: {
        skill_id: z.string(),
        correlation_id: z.string().optional(),
        inject_mode: injectModeSchema.optional(),
        token_budget: z.number().int().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    loadHandler,
  );

  const cleanupHandler = async ({ correlation_id }: { correlation_id: string }) => {
    logToolOk('skill_cleanup', { correlation_id });
    return toolOk(runCleanup(correlation_id) as unknown as Record<string, unknown>);
  };

  mcp.registerTool(
    'cleanup',
    {
      description:
        'Idempotent cleanup for a correlation_id.' + LOW_LEVEL_TOOL_NOTE,
      inputSchema: {
        correlation_id: z.string().describe('UUID from load or begin_task'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    cleanupHandler,
  );

  mcp.registerTool(
    'skill_cleanup',
    {
      description: 'Alias for cleanup.' + LOW_LEVEL_TOOL_NOTE,
      inputSchema: {
        correlation_id: z.string(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    cleanupHandler,
  );

  mcp.registerTool(
    'health',
    {
      description:
        'Verify the skill store is reachable before starting work. Returns ok, skill_count, skills_root. Call this if STORE_UNAVAILABLE errors appear — the root path may need fixing with npx skilling setup --force.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const { seeded } = ensureBootstrapCatalog(repoRoot);
      const index = getSkillIndex(rootDisplay, config.skillsMetaDir);
      if (!index.ok) {
        return toolOk({
          ok: false,
          catalog_status: 'unavailable',
          bootstrap_skill_ids: [...BOOTSTRAP_SKILL_IDS],
          seeded,
          skills_root: rootDisplay,
          error: formatIndexError(index),
          setup_hint: 'npx skilling setup --force',
        });
      }
      return toolOk({
        ok: true,
        skill_count: index.skills.length,
        catalog_status: index.skills.length > 0 ? 'ready' : 'empty',
        skills_root: rootDisplay,
        skills_meta_dir: config.skillsMetaDir,
        bootstrap_skill_ids: [...BOOTSTRAP_SKILL_IDS],
        ...(seeded.length ? { seeded } : {}),
        ...(index.skills.length === 0
          ? {
              message:
                'Bootstrap only. Use begin_task(phase: discovery) or begin_task(skill_id: find-skills, token_budget: 300) to grow the catalog.',
            }
          : {}),
        setup_hint:
          'Set SKILL_ROOT to an absolute .agents/skills path, or run npx skilling setup --force.',
      });
    },
  );

  mcp.registerTool(
    'get_session',
    {
      description:
        'Check active task session before begin_task. Returns skill_id, summary, inject_mode, stale (TTL >80% elapsed). Expired TTL returns active:false and auto-clears. Use include_body to re-read shaped content.',
      inputSchema: {
        include_summary: z.boolean().optional(),
        include_body: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      return toolOk(
        getSession(rootDisplay, repoRoot, config, {
          include_summary: input.include_summary,
          include_body: input.include_body,
        }) as unknown as Record<string, unknown>,
      );
    },
  );

  mcp.registerTool(
    'begin_task',
    {
      description:
        'Start a task stage: shapes skill body within token_budget and opens a session. Pass skill_id OR phase (discovery|plan|implement|review) to auto-pick via suggest_skills. Returns body (follow it). Call end_task when the stage or overall task is done — end_task returns usage_summary.',
      inputSchema: {
        prompt: z.string(),
        goal: z.string().optional(),
        context: z.string().optional(),
        client: z.string().optional(),
        workspace_path: z.string().optional(),
        skill_id: z
          .string()
          .optional()
          .describe('Optional when phase is set — server auto-picks top match'),
        phase: z
          .string()
          .optional()
          .describe('discovery|plan|implement|review — auto-picks skill when skill_id omitted'),
        token_budget: z
          .number()
          .int()
          .optional()
          .describe('Inject shaping: 300 discovery, 900 implement (<350→summary, <900→compact)'),
        inject_mode: injectModeSchema.optional(),
        end_previous: z.boolean().optional(),
        response_detail: z.enum(['summary', 'full']).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        logPromptSnippet('begin_task', input.prompt.trim() || input.goal?.trim() || '');
        return toolOk(
          beginTask(rootDisplay, repoRoot, config, input) as unknown as Record<string, unknown>,
        );
      } catch (e) {
        return handleError('begin_task', e);
      }
    },
  );

  mcp.registerTool(
    'end_task',
    {
      description:
        'Required when a stage or the overall task is complete, and before switching unrelated topics. Clears session files and returns usage_summary (skills used, where, why). Optional reason for completion note.',
      inputSchema: {
        correlation_id: z.string().uuid().optional(),
        reason: z
          .string()
          .optional()
          .describe('Optional note when the overall task is complete (included in usage_summary)'),
        finalize: z
          .boolean()
          .optional()
          .describe(
            'When true, clears usage-log after summary. Use on the last end_task of a multi-phase task.',
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ correlation_id, reason, finalize }) => {
      try {
        return toolOk(
          endTask(repoRoot, { correlation_id, reason, finalize }) as unknown as Record<
            string,
            unknown
          >,
        );
      } catch (e) {
        return handleError('end_task', e);
      }
    },
  );

  mcp.registerPrompt(
    'skilling_workflow',
    {
      title: 'Skilling lifecycle workflow',
      description:
        'Full Skilling MCP lifecycle — list, suggest_skills, begin_task(skill_id), end_task. Fetch when you need the complete workflow guide.',
    },
    async () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: SKILLING_WORKFLOW_PROMPT,
          },
        },
      ],
    }),
  );

  return mcp;
}

export async function runMcpServer(skillRoot: string, config: SkillingConfig): Promise<void> {
  const server = createSkillingServer(skillRoot, config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
