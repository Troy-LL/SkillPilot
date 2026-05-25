import fs from 'node:fs';
import path from 'node:path';

export const USAGE_LOG_VERSION = 1;

export type UsageEpisode = {
  skill_id: string;
  title: string;
  phase?: string;
  rationale: string;
  summary: string;
  started_at: string;
  ended_at?: string;
  correlation_id: string;
};

export type UsageLog = {
  version: typeof USAGE_LOG_VERSION;
  episodes: UsageEpisode[];
};

export type UsageSummaryEpisode = {
  skill_id: string;
  title: string;
  phase?: string;
  where: string;
  why: string;
  summary: string;
  started_at: string;
  ended_at: string;
};

export type UsageSummary = {
  episodes: UsageSummaryEpisode[];
  skills_used: string[];
  message: string;
};

export function resolveUsageLogPath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.skilling', 'usage-log.json');
}

export function phaseToWhere(phase?: string): string {
  const p = phase?.trim().toLowerCase();
  switch (p) {
    case 'plan':
      return 'planning stage';
    case 'implement':
      return 'implementation stage';
    case 'discovery':
      return 'skill discovery';
    case 'review':
      return 'review stage';
    default:
      return phase?.trim() ? `stage: ${phase.trim()}` : 'task stage';
  }
}

function readLog(repoRoot: string): UsageLog {
  const file = resolveUsageLogPath(repoRoot);
  if (!fs.existsSync(file)) {
    return { version: USAGE_LOG_VERSION, episodes: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as UsageLog;
    if (raw?.version === USAGE_LOG_VERSION && Array.isArray(raw.episodes)) {
      return raw;
    }
  } catch {
    /* treat corrupt log as empty */
  }
  return { version: USAGE_LOG_VERSION, episodes: [] };
}

function writeLog(repoRoot: string, log: UsageLog): void {
  const dir = path.join(path.resolve(repoRoot), '.skilling');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolveUsageLogPath(repoRoot), JSON.stringify(log, null, 2), 'utf8');
}

export function appendUsageEpisode(
  repoRoot: string,
  episode: Omit<UsageEpisode, 'ended_at'>,
): void {
  const log = readLog(repoRoot);
  log.episodes.push({ ...episode });
  writeLog(repoRoot, log);
}

export function closeActiveUsageEpisode(
  repoRoot: string,
  correlation_id: string,
  ended_at = new Date().toISOString(),
): void {
  const log = readLog(repoRoot);
  for (let i = log.episodes.length - 1; i >= 0; i--) {
    const ep = log.episodes[i]!;
    if (ep.correlation_id === correlation_id && !ep.ended_at) {
      ep.ended_at = ended_at;
      writeLog(repoRoot, log);
      return;
    }
  }
}

export function buildUsageSummary(repoRoot: string, taskCompleteReason?: string): UsageSummary {
  const log = readLog(repoRoot);
  const now = new Date().toISOString();
  const episodes: UsageSummaryEpisode[] = log.episodes.map((ep) => ({
    skill_id: ep.skill_id,
    title: ep.title,
    ...(ep.phase ? { phase: ep.phase } : {}),
    where: phaseToWhere(ep.phase),
    why: ep.rationale,
    summary: ep.summary,
    started_at: ep.started_at,
    ended_at: ep.ended_at ?? now,
  }));
  const skills_used = [...new Set(episodes.map((e) => e.skill_id))];
  const lines = episodes.map(
    (e) => `- **${e.title}** (\`${e.skill_id}\`) — ${e.where}: ${e.summary}`,
  );
  let message =
    episodes.length > 0
      ? `Task used ${episodes.length} skill episode(s):\n${lines.join('\n')}`
      : 'No skill episodes were recorded for this task.';
  if (taskCompleteReason?.trim()) {
    message += `\n\nCompletion note: ${taskCompleteReason.trim()}`;
  }
  return { episodes, skills_used, message };
}

export function clearUsageLog(repoRoot: string): void {
  const file = resolveUsageLogPath(repoRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
