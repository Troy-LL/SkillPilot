/**
 * Import one skill from .agents/skills into skills/ (no npx).
 *
 * Usage: node scripts/import-skill.mjs <agents-folder> [--id custom-id]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importSkillFromAgents } from '../dist/import-skill.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const skillRoot = path.join(repoRoot, 'skills');

const args = process.argv.slice(2);
const folder = args.find((a) => !a.startsWith('--'));
const idFlag = args.indexOf('--id');
const id = idFlag >= 0 ? args[idFlag + 1] : undefined;

if (!folder) {
  process.stderr.write('Usage: node scripts/import-skill.mjs <agents-folder> [--id skill-id]\n');
  process.exit(2);
}

const result = importSkillFromAgents(repoRoot, folder, skillRoot, { id, source: `agents:${folder}` });
console.log(JSON.stringify(result, null, 2));
