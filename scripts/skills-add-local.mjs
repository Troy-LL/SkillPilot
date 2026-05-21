/**
 * Install a skill into THIS repo’s .agents/skills (project-local, not global -g).
 *
 * Usage (from Skilling repo root):
 *   node scripts/skills-add-local.mjs vercel-labs/skills@find-skills
 *   node scripts/skills-add-local.mjs vercel-labs/skills@find-skills find-skills
 *
 * Arg2: agents folder name under .agents/skills (default: segment after @ or last path segment)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const pkg = process.argv[2];
if (!pkg) {
  process.stderr.write(
    'Usage: node scripts/skills-add-local.mjs <owner/repo@skill> [agents-folder-name]\n',
  );
  process.exit(2);
}

function defaultAgentsFolder(spec) {
  if (spec.includes('@')) {
    const afterAt = spec.split('@').pop();
    if (afterAt) return afterAt;
  }
  const last = spec.split('/').pop();
  return last ?? spec;
}

const agentsFolder = process.argv[3] ?? defaultAgentsFolder(pkg);

process.stderr.write(`Installing ${pkg} into ${repoRoot}/.agents/skills (project-local, no -g)…\n`);

const install = spawnSync('npx', ['skills', 'add', pkg, '-y'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: true,
});

if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

process.stderr.write(`Done. Skill installed at .agents/skills/${agentsFolder}/\n`);
