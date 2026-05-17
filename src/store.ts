import fs from 'node:fs';
import path from 'node:path';
import { parseSkillMarkdown } from './parse.js';
import type { SkillFrontMatter } from './parse.js';
import { validatePrimarySize } from './validate.js';

export type SkillListEntry = {
  id: string;
  title: string;
  summary: string;
  tags?: string[];
  version?: string;
};

export type IndexFailure = {
  folder: string;
  reason: string;
};

export type SkillIndex =
  | {
      ok: true;
      skills: SkillListEntry[];
      /** skill id -> absolute path to SKILL.md */
      paths: Map<string, string>;
      /** skill id -> parsed front matter (for select / ranking) */
      metas: Map<string, SkillFrontMatter>;
    }
  | {
      ok: false;
      error: string;
      failures: IndexFailure[];
    };

function realPathBestEffort(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

export function resolveSkillRoot(rootArg: string): string {
  const resolved = path.resolve(rootArg);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`SKILL_ROOT is not a directory: ${resolved}`);
  }
  return realPathBestEffort(resolved);
}

/** Ensure candidate is under root (after resolve). */
export function assertPathUnderRoot(rootReal: string, candidateAbs: string): void {
  const rel = path.relative(rootReal, candidateAbs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('path resolves outside skill root');
  }
}

function readSkillFile(rootReal: string, folderName: string): { text: string } {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(folderName)) {
    throw new Error('folder name is not a valid skill_id');
  }
  const abs = path.resolve(path.join(rootReal, folderName, 'SKILL.md'));
  assertPathUnderRoot(rootReal, abs);
  if (!fs.existsSync(abs)) {
    throw new Error('SKILL.md missing');
  }
  const absReal = fs.realpathSync.native(abs);
  assertPathUnderRoot(rootReal, absReal);
  const buf = fs.readFileSync(absReal);
  validatePrimarySize(buf);
  const text = buf.toString('utf8');
  return { text };
}

export function buildIndex(skillRoot: string): SkillIndex {
  const rootReal = resolveSkillRoot(skillRoot);
  const entries: { folder: string; meta: SkillFrontMatter }[] = [];
  const failures: IndexFailure[] = [];
  const dirents = fs.readdirSync(rootReal, { withFileTypes: true });
  for (const d of dirents) {
    if (!d.isDirectory()) continue;
    const folder = d.name;
    try {
      const { text } = readSkillFile(rootReal, folder);
      const { meta } = parseSkillMarkdown(text, folder);
      entries.push({ folder, meta });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ folder, reason: msg });
    }
  }
  const byId = new Map<string, { folder: string; meta: SkillFrontMatter }[]>();
  for (const e of entries) {
    const list = byId.get(e.meta.id) ?? [];
    list.push(e);
    byId.set(e.meta.id, list);
  }
  const dupIds = [...byId.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
  if (dupIds.length > 0) {
    return {
      ok: false,
      error: `Duplicate skill id(s) in store: ${dupIds.join(', ')} — conflicting skills rejected (skill-rules §3)`,
      failures,
    };
  }
  if (failures.length > 0) {
    return {
      ok: false,
      error: `Skill store has ${failures.length} invalid skill folder(s); fix or remove before listing.`,
      failures,
    };
  }
  const skills: SkillListEntry[] = entries
    .map((e) => ({
      id: e.meta.id,
      title: e.meta.title,
      summary: e.meta.summary,
      ...(e.meta.tags?.length ? { tags: e.meta.tags } : {}),
      ...(e.meta.version ? { version: e.meta.version } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const paths = new Map<string, string>();
  const metas = new Map<string, SkillFrontMatter>();
  for (const e of entries) {
    paths.set(e.meta.id, path.join(rootReal, e.folder, 'SKILL.md'));
    metas.set(e.meta.id, e.meta);
  }
  return { ok: true, skills, paths, metas };
}

export function loadSkillBody(skillRoot: string, skillId: string): { meta: SkillFrontMatter; body: string } {
  const index = buildIndex(skillRoot);
  if (!index.ok) {
    throw new Error(index.error);
  }
  const file = index.paths.get(skillId);
  if (!file) {
    throw new Error(
      `Unknown skill_id: ${skillId}. Call the list tool for available skill ids.`,
    );
  }
  const rootReal = resolveSkillRoot(skillRoot);
  const abs = path.resolve(file);
  assertPathUnderRoot(rootReal, abs);
  const absReal = fs.realpathSync.native(abs);
  assertPathUnderRoot(rootReal, absReal);
  const buf = fs.readFileSync(absReal);
  validatePrimarySize(buf);
  const text = buf.toString('utf8');
  const folder = path.basename(path.dirname(file));
  return parseSkillMarkdown(text, folder);
}

export function formatIndexError(index: Extract<SkillIndex, { ok: false }>): string {
  const lines = [index.error];
  for (const f of index.failures) {
    lines.push(`- ${f.folder}: ${f.reason}`);
  }
  return lines.join('\n');
}
