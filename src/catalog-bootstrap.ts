import fs from 'node:fs';
import path from 'node:path';
import { resolveBundledSkillsRoot } from './config.js';
import { invalidateIndexCache } from './store.js';

/** Minimum skills copied into an empty project catalog so list/begin_task never dead-end. */
export const BOOTSTRAP_SKILL_IDS = ['find-skills', 'com-skilling-orchestrator'] as const;

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, name.name);
    const to = path.join(dest, name.name);
    if (name.isDirectory()) copyDirSync(from, to);
    else if (name.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * Idempotent: ensure find-skills and orchestrator exist under project `.agents/skills/`.
 * Returns skill ids newly seeded this call.
 */
export function ensureBootstrapCatalog(repoRoot: string): { seeded: string[] } {
  const bundledRoot = resolveBundledSkillsRoot();
  if (!bundledRoot) return { seeded: [] };

  const destDir = path.join(path.resolve(repoRoot), '.agents', 'skills');
  fs.mkdirSync(destDir, { recursive: true });

  const seeded: string[] = [];
  for (const id of BOOTSTRAP_SKILL_IDS) {
    const src = path.join(bundledRoot, id);
    const dest = path.join(destDir, id);
    if (!fs.existsSync(path.join(src, 'SKILL.md'))) continue;
    if (fs.existsSync(path.join(dest, 'SKILL.md'))) continue;
    copyDirSync(src, dest);
    seeded.push(id);
  }

  if (seeded.length > 0) invalidateIndexCache();
  return { seeded };
}
