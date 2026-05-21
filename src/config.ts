import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_TOKEN_BUDGET,
  DEFAULT_TTL_MS,
  MAX_INJECT_BYTES,
  PLAN_MIN_CONFIDENCE,
  SELECT_MIN_CONFIDENCE,
} from './constants.js';
import type { InjectMode } from './shape-body.js';
import { resolveSkillsMetaDir } from './skill-meta-overlay.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type SkillingConfig = {
  skillsRoot: string;
  skillsMetaDir: string;
  selector: 'heuristic' | 'embedding' | 'llm';
  maxInjectBytes: number;
  defaultTokenBudget: number;
  ttlSeconds: number;
  logLevel: LogLevel;
  logPrompts: boolean;
  defaultInjectMode: InjectMode;
  selectMinConfidence: number;
  planMinConfidence: number;
};

type FileConfig = Partial<{
  skillsRoot: string;
  skillsMetaDir: string;
  selector: string;
  maxInjectBytes: number;
  defaultTokenBudget: number;
  defaultInjectMode: string;
  ttlSeconds: number;
  log: { level?: string; format?: string };
}>;

function parseLogLevel(v: string | undefined): LogLevel {
  if (v === 'debug' || v === 'warn' || v === 'error') return v;
  return 'info';
}

function loadFileConfig(cwd: string): FileConfig {
  const explicit = process.env['SKILLING_CONFIG']?.trim();
  const candidates = [
    explicit,
    path.join(cwd, 'skilling.config.json'),
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

export function loadConfig(cwd: string, cliSkillRoot?: string): SkillingConfig {
  const file = loadFileConfig(cwd);
  const envRoot =
    process.env['SKILL_ROOT']?.trim() || process.env['SKILLING_SKILLS_ROOT']?.trim();
  const skillsRoot = path.resolve(
    cliSkillRoot || envRoot || file.skillsRoot || path.join(cwd, '.agents', 'skills'),
  );
  const skillsMetaDir = path.resolve(
    process.env['SKILLING_SKILLS_META_DIR']?.trim() ||
      file.skillsMetaDir ||
      resolveSkillsMetaDir(skillsRoot),
  );

  const selectorRaw = process.env['SKILLING_SELECTOR']?.trim() || file.selector || 'heuristic';
  const selector =
    selectorRaw === 'embedding' || selectorRaw === 'llm' ? selectorRaw : 'heuristic';

  const maxInjectBytes = Number(
    process.env['SKILLING_MAX_INJECT_BYTES'] ?? file.maxInjectBytes ?? MAX_INJECT_BYTES,
  );
  const defaultTokenBudget = Number(
    process.env['SKILLING_DEFAULT_TOKEN_BUDGET'] ??
      file.defaultTokenBudget ??
      DEFAULT_TOKEN_BUDGET,
  );
  const ttlSeconds = Number(
    process.env['SKILLING_TTL_SECONDS'] ?? file.ttlSeconds ?? DEFAULT_TTL_MS / 1000,
  );

  const injectModeRaw =
    process.env['SKILLING_DEFAULT_INJECT_MODE']?.trim() || file.defaultInjectMode || 'full';
  const defaultInjectMode: InjectMode =
    injectModeRaw === 'summary' ||
    injectModeRaw === 'compact' ||
    injectModeRaw === 'sections' ||
    injectModeRaw === 'full'
      ? injectModeRaw
      : 'full';

  const selectMinConfidenceRaw = Number(
    process.env['SKILLING_SELECT_MIN_CONFIDENCE'] ?? SELECT_MIN_CONFIDENCE,
  );
  const planMinConfidenceRaw = Number(
    process.env['SKILLING_PLAN_MIN_CONFIDENCE'] ?? PLAN_MIN_CONFIDENCE,
  );
  const selectMinConfidence = Number.isFinite(selectMinConfidenceRaw)
    ? selectMinConfidenceRaw
    : SELECT_MIN_CONFIDENCE;
  const planMinConfidence = Number.isFinite(planMinConfidenceRaw)
    ? planMinConfidenceRaw
    : PLAN_MIN_CONFIDENCE;

  return {
    skillsRoot,
    skillsMetaDir,
    selector,
    maxInjectBytes: Number.isFinite(maxInjectBytes) ? maxInjectBytes : MAX_INJECT_BYTES,
    defaultTokenBudget: Number.isFinite(defaultTokenBudget)
      ? defaultTokenBudget
      : DEFAULT_TOKEN_BUDGET,
    ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : DEFAULT_TTL_MS / 1000,
    logLevel: parseLogLevel(process.env['SKILLING_LOG_LEVEL'] ?? file.log?.level),
    logPrompts: process.env['SKILLING_LOG_PROMPTS'] === 'true',
    defaultInjectMode,
    selectMinConfidence,
    planMinConfidence,
  };
}
