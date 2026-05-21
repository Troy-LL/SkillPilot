import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

/** Hosts sometimes pass literal `${workspaceFolder}` when template expansion is unsupported. */
export function isUnresolvedTemplatePath(value: string): boolean {
  return value.includes('${');
}

function isSkillsDir(candidate: string): boolean {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/** Walk upward from startDir looking for `<dir>/.agents/skills`. */
export function discoverWorkspaceSkillsRoot(startDir: string): string | null {
  if (!startDir.trim()) return null;
  let dir = path.resolve(startDir);
  for (let depth = 0; depth < 25; depth++) {
    const candidate = path.join(dir, '.agents', 'skills');
    if (isSkillsDir(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Bundled catalog shipped with the npm package (parent of dist/). */
export function resolveBundledSkillsRoot(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidate = path.resolve(here, '..', '.agents', 'skills');
  return isSkillsDir(candidate) ? candidate : null;
}

function normalizeEnvRoot(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || isUnresolvedTemplatePath(trimmed)) return undefined;
  return trimmed;
}

function resolveSkillsRootPath(
  cwd: string,
  cliSkillRoot: string | undefined,
  fileSkillsRoot: string | undefined,
): string {
  if (cliSkillRoot?.trim()) return path.resolve(cliSkillRoot.trim());

  const envRoot =
    normalizeEnvRoot(process.env['SKILL_ROOT']) ??
    normalizeEnvRoot(process.env['SKILLING_SKILLS_ROOT']);
  if (envRoot) return path.resolve(envRoot);
  if (fileSkillsRoot?.trim()) return path.resolve(fileSkillsRoot.trim());

  const searchRoots = [
    cwd,
    process.env['INIT_CWD']?.trim(),
    process.env['WORKSPACE_FOLDER']?.trim(),
    process.env['VSCODE_CWD']?.trim(),
  ].filter(Boolean) as string[];

  for (const start of searchRoots) {
    const discovered = discoverWorkspaceSkillsRoot(start);
    if (discovered) return discovered;
  }

  return resolveBundledSkillsRoot() ?? path.join(cwd, '.agents', 'skills');
}

export function loadConfig(cwd: string, cliSkillRoot?: string): SkillingConfig {
  const file = loadFileConfig(cwd);
  const skillsRoot = path.resolve(resolveSkillsRootPath(cwd, cliSkillRoot, file.skillsRoot));
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
