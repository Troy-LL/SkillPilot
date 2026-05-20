import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** SkillPilot install root (contains dist/index.js). */
export function resolveServerRoot(hookScriptDir) {
  const env = process.env.SKILLPILOT_SERVER_ROOT?.trim();
  if (env) return path.resolve(env);

  const candidates = [
    path.resolve(hookScriptDir, '..'),
    path.resolve(hookScriptDir, '..', '..'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'dist', 'index.js'))) return c;
  }
  return candidates[0];
}

export function resolveSkillRoot(serverRoot) {
  const env = process.env.SKILL_ROOT?.trim();
  if (env) return path.resolve(env);
  return path.join(serverRoot, '.agents', 'skills');
}

export function workspaceRoots(hookInput, hookScriptDir) {
  const roots = new Set();
  if (Array.isArray(hookInput.workspace_roots)) {
    for (const r of hookInput.workspace_roots) {
      if (typeof r === 'string' && r.trim()) roots.add(path.resolve(r.trim()));
    }
  }
  roots.add(process.cwd());
  const serverRoot = resolveServerRoot(hookScriptDir);
  if (serverRoot) roots.add(serverRoot);
  return [...roots];
}

export function hookScriptDir(importMetaUrl) {
  return path.dirname(fileURLToPath(importMetaUrl));
}
