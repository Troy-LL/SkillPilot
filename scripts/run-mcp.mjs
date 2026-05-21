#!/usr/bin/env node
/**
 * Portable MCP entry for npm / Cursor plugin installs.
 * Routes `setup` subcommand; otherwise starts stdio MCP server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'dist', 'index.js');
const setupLib = path.join(root, 'scripts', 'setup-lib.mjs');

const subcommand = process.argv[2];
if (subcommand === 'setup' || subcommand === '--help' || subcommand === '-h') {
  const args = subcommand === 'setup' ? process.argv.slice(3) : process.argv.slice(2);
  const { runSetup } = await import(pathToFileURL(setupLib).href);
  try {
    await runSetup(args);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.stderr.write('Run "npx skilling setup --help" for usage.\n');
    process.exit(1);
  }
}

if (!fs.existsSync(entry)) {
  process.stderr.write(
    `Skilling: missing ${entry}. Run "npm install && npm run build" in the plugin directory.\n`,
  );
  process.exit(1);
}

process.env.SKILLING_SKILLS_META_DIR =
  process.env.SKILLING_SKILLS_META_DIR?.trim() ||
  path.join(root, '.agents', 'skills-meta');

await import(pathToFileURL(entry).href);
