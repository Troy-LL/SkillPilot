import { randomUUID } from 'node:crypto';
import { CorrelationRegistry } from './correlation-registry.js';
import { DEFAULT_TTL_MS, MAX_SELECT_INPUT_CHARS } from './constants.js';
import { resolveRepoRoot } from './import-skill.js';
import { selectSkill } from './select.js';
import type { SelectResult } from './select.js';
import { clearSession, readSession, writeSession } from './session-store.js';
import { buildIndex, formatIndexError, loadSkillBody } from './store.js';
import { isValidSkillId } from './validate.js';

const correlationRegistry = new CorrelationRegistry();

export type LoadEpisodeResult = {
  skill_id: string;
  body: string;
  ttl_ms: number;
  correlation_id: string;
};

export type BeginTaskInput = {
  prompt: string;
  goal?: string;
  client?: string;
  workspace_path?: string;
  skill_id?: string;
  phase?: string;
  end_previous?: boolean;
};

export type BeginTaskResult = LoadEpisodeResult &
  Pick<SelectResult, 'confidence' | 'rationale' | 'warnings' | 'alternatives'> & {
    previous_ended: boolean;
  };

export type EndTaskResult = {
  ok: true;
  correlation_id: string;
  skill_id?: string;
};

export type GetSessionResult =
  | { active: false }
  | {
      active: true;
      skill_id: string;
      correlation_id: string;
      ttl_ms: number;
      started_at: string;
      phase?: string;
    };

function logInfo(skillId: string | undefined, correlationId: string | undefined, version?: string): void {
  const parts = ['skillpilot'];
  if (skillId) parts.push(`skill_id=${skillId}`);
  if (correlationId) parts.push(`correlation_id=${correlationId}`);
  if (version) parts.push(`version=${version}`);
  process.stderr.write(`${parts.join(' ')}\n`);
}

export function validateSkillIdForLoad(skill_id: string): string | null {
  if (!isValidSkillId(skill_id)) {
    return `Invalid skill_id (must match skill-rules §2): ${skill_id}. Call the list tool for valid ids.`;
  }
  if (skill_id.includes('..') || skill_id.includes('/') || skill_id.includes('\\')) {
    return 'skill_id must not contain path segments. Call the list tool for valid ids.';
  }
  return null;
}

export function loadSkillEpisode(skillRoot: string, skillId: string): LoadEpisodeResult {
  const err = validateSkillIdForLoad(skillId);
  if (err) throw new Error(err);
  const { meta, body } = loadSkillBody(skillRoot, skillId);
  const correlation_id = randomUUID();
  correlationRegistry.add(correlation_id);
  logInfo(meta.id, correlation_id, meta.version);
  return {
    skill_id: meta.id,
    body,
    ttl_ms: DEFAULT_TTL_MS,
    correlation_id,
  };
}

export function runCleanup(correlation_id: string): EndTaskResult {
  correlationRegistry.delete(correlation_id);
  logInfo(undefined, correlation_id, undefined);
  return { ok: true, correlation_id };
}

export function beginTask(skillRoot: string, repoRoot: string, input: BeginTaskInput): BeginTaskResult {
  const trimmedPrompt = input.prompt.trim();
  if (!trimmedPrompt && !(input.goal?.trim())) {
    throw new Error('begin_task requires a non-empty prompt or goal. Call list to browse skills.');
  }
  if (
    input.prompt.length > MAX_SELECT_INPUT_CHARS ||
    (input.goal?.length ?? 0) > MAX_SELECT_INPUT_CHARS
  ) {
    throw new Error(`prompt and goal must each be at most ${MAX_SELECT_INPUT_CHARS} characters.`);
  }

  let previous_ended = false;
  if (input.end_previous !== false) {
    const prev = readSession(repoRoot);
    if (prev?.correlation_id) {
      runCleanup(prev.correlation_id);
      clearSession(repoRoot);
      previous_ended = true;
    }
  }

  let skillId = input.skill_id?.trim();
  let selectExtras: SelectResult = {
    skill_id: skillId ?? null,
    confidence: 1,
    rationale: 'skill_id provided by caller',
  };

  if (!skillId) {
    const index = buildIndex(skillRoot);
    if (!index.ok) throw new Error(formatIndexError(index));
    const result = selectSkill([...index.metas.values()], {
      prompt: trimmedPrompt || input.goal!.trim(),
      goal: input.goal?.trim(),
      client: input.client?.trim(),
      workspace_path: input.workspace_path?.trim(),
    });
    if (!result.skill_id) {
      throw new Error(
        result.rationale +
          (result.warnings?.length ? ` warnings: ${result.warnings.join(', ')}` : ''),
      );
    }
    skillId = result.skill_id;
    selectExtras = result;
  } else {
    const err = validateSkillIdForLoad(skillId);
    if (err) throw new Error(err);
  }

  const episode = loadSkillEpisode(skillRoot, skillId);
  writeSession(repoRoot, {
    skill_id: episode.skill_id,
    correlation_id: episode.correlation_id,
    ttl_ms: episode.ttl_ms,
    started_at: new Date().toISOString(),
    ...(input.phase?.trim() ? { phase: input.phase.trim() } : {}),
  });

  return {
    ...episode,
    confidence: selectExtras.confidence,
    rationale: selectExtras.rationale,
    ...(selectExtras.warnings?.length ? { warnings: selectExtras.warnings } : {}),
    ...(selectExtras.alternatives?.length ? { alternatives: selectExtras.alternatives } : {}),
    previous_ended,
  };
}

export function endTask(
  repoRoot: string,
  correlation_id?: string,
): EndTaskResult & { skill_id?: string } {
  const session = readSession(repoRoot);
  const id = correlation_id?.trim() || session?.correlation_id;
  if (!id) {
    throw new Error(
      'No active session. Call begin_task first or pass correlation_id from the load response.',
    );
  }
  const result = runCleanup(id);
  clearSession(repoRoot);
  return { ...result, skill_id: session?.skill_id };
}

export function getSession(repoRoot: string): GetSessionResult {
  const session = readSession(repoRoot);
  if (!session) return { active: false };
  return {
    active: true,
    skill_id: session.skill_id,
    correlation_id: session.correlation_id,
    ttl_ms: session.ttl_ms,
    started_at: session.started_at,
    ...(session.phase ? { phase: session.phase } : {}),
  };
}

export function resolveRepoRootFromSkillRoot(skillRoot: string): string {
  return resolveRepoRoot(skillRoot);
}
