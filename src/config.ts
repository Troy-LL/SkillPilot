import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_TTL_MS,
  MAX_INJECT_BYTES,
} from './constants.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type SkillPilotConfig = {
  skillsRoot: string;
  selector: 'heuristic' | 'embedding' | 'llm';
  maxInjectBytes: number;
  defaultTokenBudget: number;
  ttlSeconds: number;
  logLevel: LogLevel;
  logPrompts: boolean;
};

type FileConfig = Partial<{
  skillsRoot: string;
  selector: string;
  maxInjectBytes: number;
  defaultTokenBudget: number;
  ttlSeconds: number;
  log: { level?: string; format?: string };
}>;

function parseLogLevel(v: string | undefined): LogLevel {
  if (v === 'debug' || v === 'warn' || v === 'error') return v;
  return 'info';
}

function loadFileConfig(cwd: string): FileConfig {
  const explicit = process.env['SKILLPILOT_CONFIG']?.trim();
  const candidates = [
    explicit,
    path.join(cwd, 'skillpilot.config.json'),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as FileConfig;
      }
    } catch {
      /* ignore malformed file */
    }
  }
  return {};
}

export function loadConfig(cwd: string, cliSkillRoot?: string): SkillPilotConfig {
  const file = loadFileConfig(cwd);
  const envRoot =
    process.env['SKILL_ROOT']?.trim() || process.env['SKILLPILOT_SKILLS_ROOT']?.trim();
  const skillsRoot = path.resolve(
    cliSkillRoot || envRoot || file.skillsRoot || path.join(cwd, '.agents', 'skills'),
  );

  const selectorRaw = process.env['SKILLPILOT_SELECTOR']?.trim() || file.selector || 'heuristic';
  const selector =
    selectorRaw === 'embedding' || selectorRaw === 'llm' ? selectorRaw : 'heuristic';

  const maxInjectBytes = Number(
    process.env['SKILLPILOT_MAX_INJECT_BYTES'] ?? file.maxInjectBytes ?? MAX_INJECT_BYTES,
  );
  const defaultTokenBudget = Number(
    process.env['SKILLPILOT_DEFAULT_TOKEN_BUDGET'] ??
      file.defaultTokenBudget ??
      DEFAULT_TOKEN_BUDGET,
  );
  const ttlSeconds = Number(
    process.env['SKILLPILOT_TTL_SECONDS'] ?? file.ttlSeconds ?? DEFAULT_TTL_MS / 1000,
  );

  return {
    skillsRoot,
    selector,
    maxInjectBytes: Number.isFinite(maxInjectBytes) ? maxInjectBytes : MAX_INJECT_BYTES,
    defaultTokenBudget: Number.isFinite(defaultTokenBudget)
      ? defaultTokenBudget
      : DEFAULT_TOKEN_BUDGET,
    ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : DEFAULT_TTL_MS / 1000,
    logLevel: parseLogLevel(process.env['SKILLPILOT_LOG_LEVEL'] ?? file.log?.level),
    logPrompts: process.env['SKILLPILOT_LOG_PROMPTS'] === 'true',
  };
}
