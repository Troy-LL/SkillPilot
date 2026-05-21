#!/usr/bin/env node
/**
 * Seeds find-skills into the installing project after npm install.
 */
import { runPostinstall } from './setup-lib.mjs';

try {
  await runPostinstall();
} catch (e) {
  process.stderr.write(
    `Skilling postinstall: ${e instanceof Error ? e.message : String(e)}\n` +
      'Run "npx skilling setup" manually after fixing the issue.\n',
  );
  process.exit(0);
}
