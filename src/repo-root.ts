import path from 'node:path';

/** Repo root from SKILL_ROOT (e.g. parent of `.agents/skills`). */
export function resolveRepoRoot(skillRoot: string, repoRootArg?: string): string {
  if (repoRootArg) return path.resolve(repoRootArg);
  const root = path.resolve(skillRoot);
  if (path.basename(root) === 'skills') {
    const parent = path.dirname(root);
    if (path.basename(parent) === '.agents') return path.dirname(parent);
    return parent;
  }
  return root;
}
