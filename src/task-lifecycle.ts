import { randomUUID } from 'node:crypto';
import type { SkillingConfig } from './config.js';
import { CorrelationRegistry } from './correlation-registry.js';
import {
  DEFAULT_TTL_MS,
  DISCOVERY_TOKEN_BUDGET,
  MAX_SELECT_INPUT_CHARS,
} from './constants.js';
import { SkillingError } from './errors.js';
import { logToolOk } from './observability.js';
import type { SkillFrontMatter } from './parse.js';
import { ensureBootstrapCatalog } from './catalog-bootstrap.js';
import { resolveRepoRoot } from './repo-root.js';
import { filterCandidatesForPhaseAutoPick, getSelector } from './selector/index.js';
import type { SelectResult } from './selector/types.js';
import {
  appendUsageEpisode,
  buildUsageSummary,
  clearUsageLog,
  closeActiveUsageEpisode,
  type UsageSummary,
} from './usage-log.js';
import { resolveInjectMode, shapeSkillBody, type InjectMode, type ShapeBodyResult } from './shape-body.js';
import {
  clearSession,
  isSessionActive,
  readActiveBody,
  readSession,
  type SkillSession,
  type SkillSessionWrite,
  writeActiveBody,
  writeSession,
} from './session-store.js';
import { buildSessionSummary, promptFingerprint } from './session-summary.js';
import { formatIndexError, getSkillIndex, loadSkillBody } from './store.js';
import { isValidSkillId } from './validate.js';

const correlationRegistry = new CorrelationRegistry();

export type ResponseDetail = 'full' | 'summary';

export type LoadEpisodeResult = {
  skill_id: string;
  title: string;
  body: string;
  token_estimate: number;
  ttl_hint: number;
  ttl_ms: number;
  correlation_id: string;
  merge_hint: { role: 'system'; ephemeral: boolean };
  inject_mode: InjectMode;
  truncated?: boolean;
  omitted_code_blocks?: number;
};

const PHASE_AUTO_PICK = new Set(['discovery', 'plan', 'implement', 'review']);

export type BeginTaskInput = {
  prompt: string;
  goal?: string;
  context?: string;
  client?: string;
  workspace_path?: string;
  /** Omit when phase is discovery|plan|implement|review — server auto-picks via suggest_skills. */
  skill_id?: string;
  phase?: string;
  token_budget?: number;
  inject_mode?: InjectMode;
  end_previous?: boolean;
  response_detail?: ResponseDetail;
};

export type BeginTaskResultFull = LoadEpisodeResult &
  Pick<SelectResult, 'confidence' | 'rationale' | 'warnings' | 'alternatives'> & {
    summary: string;
    previous_ended: boolean;
    auto_selected?: boolean;
  };

export type BeginTaskResult = Omit<BeginTaskResultFull, 'alternatives'> &
  Partial<Pick<BeginTaskResultFull, 'alternatives'>>;

export type EndTaskResult = {
  ok: true;
  correlation_id: string;
  skill_id?: string;
  evicted_at?: string;
  usage_summary?: UsageSummary;
};

export type EndTaskOptions = {
  correlation_id?: string;
  /** Optional note from the agent when the overall task is complete. */
  reason?: string;
  /** When true, clears `.skilling/usage-log.json` after returning usage_summary. Use for the final stage only. */
  finalize?: boolean;
};

export type GetSessionOptions = {
  include_summary?: boolean;
  include_body?: boolean;
};

export type GetSessionResult =
  | { active: false; expired?: boolean }
  | {
      active: true;
      skill_id: string;
      correlation_id: string;
      ttl_ms: number;
      started_at: string;
      stale?: boolean;
      phase?: string;
      title?: string;
      summary?: string;
      rationale?: string;
      confidence?: number;
      warnings?: string[];
      body?: string;
    };

export function validateSkillIdForLoad(skill_id: string): string | null {
  if (!isValidSkillId(skill_id)) {
    return `Invalid skill_id (must match skill-rules §2): ${skill_id}. Call the list tool for valid ids.`;
  }
  if (skill_id.includes('..') || skill_id.includes('/') || skill_id.includes('\\')) {
    return 'skill_id must not contain path segments. Call the list tool for valid ids.';
  }
  return null;
}

function resolveTokenBudget(input: BeginTaskInput, config: SkillingConfig): number {
  if (input.token_budget !== undefined) return input.token_budget;
  const phase = input.phase?.trim().toLowerCase();
  if (phase === 'plan' || phase === 'discovery') return DISCOVERY_TOKEN_BUDGET;
  return config.defaultTokenBudget;
}

function resolveSkillForBegin(
  skillRoot: string,
  repoRoot: string,
  config: SkillingConfig,
  input: BeginTaskInput,
): { skillId: string; selectExtras: SelectResult; auto_selected: boolean } {
  const explicit = input.skill_id?.trim();
  if (explicit) {
    return {
      skillId: explicit,
      selectExtras: {
        skill_id: explicit,
        confidence: 1,
        rationale: 'skill_id provided by caller',
      },
      auto_selected: false,
    };
  }

  const phase = input.phase?.trim().toLowerCase();
  if (!phase || !PHASE_AUTO_PICK.has(phase)) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'begin_task requires skill_id or phase (discovery, plan, implement, review). Call list for catalog ids.',
    );
  }

  ensureBootstrapCatalog(repoRoot);
  const index = getSkillIndex(skillRoot, config.skillsMetaDir);
  if (!index.ok) throw new SkillingError('STORE_UNAVAILABLE', formatIndexError(index));

  const trimmedPrompt = input.prompt.trim() || input.goal!.trim();
  const autoPickPool = filterCandidatesForPhaseAutoPick([...index.metas.values()], phase, {
    prompt: trimmedPrompt,
    goal: input.goal?.trim(),
    context: input.context?.trim(),
  });
  const selector = getSelector(config);
  const result = selector.select(autoPickPool, {
    prompt: trimmedPrompt,
    goal: input.goal?.trim(),
    context: input.context?.trim(),
    client: input.client?.trim(),
    workspace_path: input.workspace_path?.trim(),
    select_max_tokens: resolveTokenBudget(input, config),
  });

  if (result.skill_id) {
    return { skillId: result.skill_id, selectExtras: result, auto_selected: true };
  }

  if (phase === 'plan' && index.metas.has('com-skilling-orchestrator')) {
    return {
      skillId: 'com-skilling-orchestrator',
      selectExtras: {
        skill_id: 'com-skilling-orchestrator',
        confidence: 1,
        rationale: 'Default planning skill for phase: plan (workflow SOP, not domain MCP chunks).',
      },
      auto_selected: true,
    };
  }

  if (phase === 'discovery' && index.metas.has('find-skills')) {
    return {
      skillId: 'find-skills',
      selectExtras: {
        skill_id: 'find-skills',
        confidence: 1,
        rationale: 'Default bootstrap skill for discovery phase.',
      },
      auto_selected: true,
    };
  }

  throw new SkillingError(
    'VALIDATION_ERROR',
    `${result.rationale} For an empty catalog, call begin_task(phase: discovery) or begin_task(skill_id: find-skills, token_budget: 300) first.`,
  );
}

function ttlMsFromMeta(meta: { ttl_seconds?: number }, config: SkillingConfig): number {
  if (meta.ttl_seconds !== undefined && meta.ttl_seconds > 0) {
    return meta.ttl_seconds * 1000;
  }
  return config.ttlSeconds > 0 ? config.ttlSeconds * 1000 : DEFAULT_TTL_MS;
}

function loadAndShapeSkill(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): { meta: SkillFrontMatter; shaped: ShapeBodyResult } {
  const err = validateSkillIdForLoad(skillId);
  if (err) throw new SkillingError('VALIDATION_ERROR', err);

  const { meta, body: rawBody } = loadSkillBody(skillRoot, skillId, config.skillsMetaDir);
  const mode = resolveInjectMode(
    options?.inject_mode,
    meta,
    options?.token_budget,
    config.defaultInjectMode,
  );
  const shaped = shapeSkillBody(rawBody, config.maxInjectBytes, {
    mode,
    meta: {
      title: meta.title,
      summary: meta.summary,
      inject_brief: meta.inject_brief,
    },
    injectSections: meta.inject_sections,
  });
  return { meta, shaped };
}

/** Shape skill body for display/read paths (get_session include_body). No registry or inject log. */
function readShapedSkillBody(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): string {
  return loadAndShapeSkill(skillRoot, skillId, config, options).shaped.body;
}

function resolveSessionBody(
  skillRoot: string,
  repoRoot: string,
  session: SkillSession,
  config: SkillingConfig,
): string {
  const fromBridge = readActiveBody(repoRoot, session.skill_id);
  if (fromBridge !== null) return fromBridge;
  return readShapedSkillBody(skillRoot, session.skill_id, config, {
    inject_mode: session.inject_mode,
    token_budget: session.token_budget,
  });
}

/** Process-local correlation count (tests / diagnostics). */
export function getCorrelationRegistrySize(): number {
  return correlationRegistry.size;
}

export function loadSkillEpisode(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  correlationId?: string,
  options?: { inject_mode?: InjectMode; token_budget?: number },
): LoadEpisodeResult {
  const { meta, shaped } = loadAndShapeSkill(skillRoot, skillId, config, options);
  const correlation_id = correlationId ?? randomUUID();
  correlationRegistry.add(correlation_id);
  const ttl_ms = ttlMsFromMeta(meta, config);

  logToolOk('skill_inject', {
    skill_id: meta.id,
    correlation_id,
    token_estimate: shaped.token_estimate,
    inject_mode: shaped.inject_mode,
    version: meta.version,
  });

  return {
    skill_id: meta.id,
    title: meta.title,
    body: shaped.body,
    token_estimate: shaped.token_estimate,
    ttl_hint: Math.floor(ttl_ms / 1000),
    ttl_ms,
    correlation_id,
    merge_hint: { role: 'system', ephemeral: true },
    inject_mode: shaped.inject_mode,
    ...(shaped.truncated ? { truncated: shaped.truncated } : {}),
    ...(shaped.omitted_code_blocks ? { omitted_code_blocks: shaped.omitted_code_blocks } : {}),
  };
}

export function runCleanup(correlation_id: string): EndTaskResult {
  correlationRegistry.delete(correlation_id);
  return {
    ok: true,
    correlation_id,
    evicted_at: new Date().toISOString(),
  };
}

function shapeBeginTaskResult(
  full: BeginTaskResultFull,
  detail: ResponseDetail,
): BeginTaskResult {
  if (detail === 'full') return full;
  const { alternatives: _alternatives, ...rest } = full;
  return rest;
}

export function estimateShapedInjectTokens(
  skillRoot: string,
  skillId: string,
  config: SkillingConfig,
  tokenBudget: number,
): number {
  return loadAndShapeSkill(skillRoot, skillId, config, { token_budget: tokenBudget }).shaped
    .token_estimate;
}

export function beginTask(
  skillRoot: string,
  repoRoot: string,
  config: SkillingConfig,
  input: BeginTaskInput,
): BeginTaskResult {
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt && !(input.goal?.trim())) {
    throw new SkillingError('VALIDATION_ERROR', 'begin_task requires a non-empty prompt or goal.');
  }
  if (
    input.prompt.length > MAX_SELECT_INPUT_CHARS ||
    (input.goal?.length ?? 0) > MAX_SELECT_INPUT_CHARS
  ) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      `prompt and goal must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`,
    );
  }

  ensureBootstrapCatalog(repoRoot);

  const { skillId, selectExtras, auto_selected } = resolveSkillForBegin(
    skillRoot,
    repoRoot,
    config,
    input,
  );

  const err = validateSkillIdForLoad(skillId);
  if (err) throw new SkillingError('VALIDATION_ERROR', err);

  const responseDetail: ResponseDetail = input.response_detail ?? 'summary';
  const tokenBudget = resolveTokenBudget(input, config);

  let previous_ended = false;
  if (input.end_previous !== false) {
    const prev = readSession(repoRoot);
    if (prev?.correlation_id) {
      closeActiveUsageEpisode(repoRoot, prev.correlation_id);
      if (isSessionActive(prev)) {
        runCleanup(prev.correlation_id);
        previous_ended = true;
      }
      clearSession(repoRoot);
    }
  }

  const episode = loadSkillEpisode(skillRoot, skillId, config, undefined, {
    inject_mode: input.inject_mode,
    token_budget: tokenBudget,
  });
  const summary = buildSessionSummary(episode.title, selectExtras.rationale);

  const sessionPayload: SkillSessionWrite = {
    skill_id: episode.skill_id,
    title: episode.title,
    summary,
    rationale: selectExtras.rationale,
    confidence: selectExtras.confidence,
    correlation_id: episode.correlation_id,
    ttl_ms: episode.ttl_ms,
    started_at: new Date().toISOString(),
    prompt_fingerprint: promptFingerprint(trimmedPrompt || input.goal!.trim(), input.goal),
    inject_mode: episode.inject_mode,
    token_budget: tokenBudget,
    ...(input.phase?.trim() ? { phase: input.phase.trim() } : {}),
  };
  writeSession(repoRoot, sessionPayload);
  writeActiveBody(repoRoot, episode.skill_id, episode.body);

  appendUsageEpisode(repoRoot, {
    skill_id: episode.skill_id,
    title: episode.title,
    phase: input.phase?.trim(),
    rationale: selectExtras.rationale,
    summary,
    started_at: sessionPayload.started_at,
    correlation_id: episode.correlation_id,
  });

  const full: BeginTaskResultFull = {
    ...episode,
    confidence: selectExtras.confidence,
    rationale: selectExtras.rationale,
    summary,
    previous_ended,
    ...(auto_selected ? { auto_selected: true } : {}),
  };

  return shapeBeginTaskResult(full, responseDetail);
}

export function endTask(
  repoRoot: string,
  options?: EndTaskOptions | string,
): EndTaskResult & { skill_id?: string } {
  const opts: EndTaskOptions =
    typeof options === 'string' ? { correlation_id: options } : (options ?? {});
  const session = readSession(repoRoot);
  const passedId = opts.correlation_id?.trim();
  if (session && passedId && passedId !== session.correlation_id) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'correlation_id does not match the active session. Omit correlation_id or pass the session correlation_id.',
    );
  }
  const id = passedId || session?.correlation_id;
  if (!id) {
    throw new SkillingError(
      'VALIDATION_ERROR',
      'No active session. Call begin_task first or pass correlation_id from the load response.',
    );
  }
  if (session) {
    closeActiveUsageEpisode(repoRoot, session.correlation_id);
  }
  const result = runCleanup(id);
  clearSession(repoRoot);
  const usage_summary = buildUsageSummary(repoRoot, opts.reason);
  if (opts.finalize) clearUsageLog(repoRoot);
  return { ...result, skill_id: session?.skill_id, usage_summary };
}

export function getSession(
  skillRoot: string,
  repoRoot: string,
  config: SkillingConfig,
  options?: GetSessionOptions,
): GetSessionResult {
  const session = readSession(repoRoot);
  if (!session) return { active: false };

  if (!isSessionActive(session)) {
    if (session.correlation_id) {
      runCleanup(session.correlation_id);
    }
    clearSession(repoRoot);
    return { active: false, expired: true };
  }

  const includeSummary = options?.include_summary !== false;
  const includeBody = options?.include_body === true;
  const startedMs = Date.parse(session.started_at);
  const stale =
    !Number.isNaN(startedMs) && Date.now() - startedMs > session.ttl_ms * 0.8;

  const base: GetSessionResult = {
    active: true,
    skill_id: session.skill_id,
    correlation_id: session.correlation_id,
    ttl_ms: session.ttl_ms,
    started_at: session.started_at,
    ...(stale ? { stale: true } : {}),
    ...(session.phase ? { phase: session.phase } : {}),
    ...(includeSummary
      ? {
          title: session.title,
          summary: session.summary,
          rationale: session.rationale,
          confidence: session.confidence,
          ...(session.warnings?.length ? { warnings: session.warnings } : {}),
        }
      : {}),
  };

  if (includeBody) {
    return {
      ...base,
      body: resolveSessionBody(skillRoot, repoRoot, session, config),
    };
  }

  return base;
}

export function resolveRepoRootFromSkillRoot(skillRoot: string): string {
  return resolveRepoRoot(skillRoot);
}
