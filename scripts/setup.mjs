#!/usr/bin/env node
/**
 * `npx skilling setup` — write MCP configs for detected IDE hosts.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSetup } from './setup-lib.mjs';

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    await runSetup(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
    process.stderr.write('Run "npx skilling setup --help" for usage.\n');
    process.exit(1);
  }
}

export { runSetup } from './setup-lib.mjs';
