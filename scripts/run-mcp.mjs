#!/usr/bin/env node
/**
 * Portable MCP entry for Cursor plugin / marketplace installs.
 * Resolves Skilling root from this script location; sets SKILL_ROOT before loading dist/index.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dist', 'index.js');

if (!fs.existsSync(entry)) {
  process.stderr.write(
    `Skilling: missing ${entry}. Run "npm install && npm run build" in the plugin directory.\n`,
  );
  process.exit(1);
}

process.env.SKILL_ROOT =
  process.env.SKILL_ROOT?.trim() || path.join(root, '.agents', 'skills');
process.env.SKILLING_SKILLS_META_DIR =
  process.env.SKILLING_SKILLS_META_DIR?.trim() ||
  path.join(root, '.agents', 'skills-meta');

await import(pathToFileURL(entry).href);
