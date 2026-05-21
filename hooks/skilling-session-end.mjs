/**
 * sessionEnd: MCP cleanup + clear workspace .skilling/session.json.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  hookScriptDir,
  resolveServerRoot,
  resolveSkillRoot,
  workspaceRoots,
} from '../scripts/hook-paths.mjs';

const HOOK_SCRIPT_DIR = hookScriptDir(import.meta.url);

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function readSession(workspaceRoot) {
  const file = path.join(workspaceRoot, '.skilling', 'session.json');
  if (!fs.existsSync(file)) return null;
  try {
    const session = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!session?.correlation_id || !session?.skill_id) return null;
    return { file, session };
  } catch {
    return null;
  }
}

function runCleanup(serverRoot, skillRoot, correlationId) {
  const serverEntry = path.join(serverRoot, 'dist', 'index.js');
  const cleanupScript = path.join(serverRoot, 'scripts', 'extension-cleanup.mjs');
  if (!fs.existsSync(serverEntry)) {
    process.stderr.write(
      `Skilling-session-end: missing ${serverEntry} (run npm run build)\n`,
    );
    return false;
  }
  if (!fs.existsSync(cleanupScript)) {
    process.stderr.write(`Skilling-session-end: missing ${cleanupScript}\n`);
    return false;
  }

  const result = spawnSync(
    process.execPath,
    [cleanupScript, correlationId, serverEntry, skillRoot],
    { cwd: serverRoot, encoding: 'utf8', windowsHide: true },
  );

  if (result.status !== 0) {
    process.stderr.write(
      result.stderr?.trim() ||
        `Skilling-session-end: cleanup exited ${result.status ?? 'unknown'}\n`,
    );
    return false;
  }
  return true;
}

function log(eventName, message) {
  process.stderr.write(`Skilling-session-end [${eventName}]: ${message}\n`);
}

async function main() {
  const hookInput = await readStdinJson();
  const eventName = hookInput.hook_event_name ?? 'sessionEnd';
  const serverRoot = resolveServerRoot(HOOK_SCRIPT_DIR);
  const skillRoot = resolveSkillRoot(serverRoot);

  for (const workspaceRoot of workspaceRoots(hookInput, HOOK_SCRIPT_DIR)) {
    const hit = readSession(workspaceRoot);
    if (!hit) continue;

    const { correlation_id, skill_id } = hit.session;
    const cleaned = runCleanup(serverRoot, skillRoot, correlation_id);
    if (cleaned) {
      fs.unlinkSync(hit.file);
      const bodyFile = path.join(workspaceRoot, '.skilling', 'active-body.md');
      if (fs.existsSync(bodyFile)) fs.unlinkSync(bodyFile);
      log(eventName, `cleanup ok for ${skill_id} (${correlation_id})`);
    } else {
      log(eventName, `cleanup failed for ${skill_id}; session file kept`);
    }
    break;
  }

  process.stdout.write('{}\n');
}

main().catch((err) => {
  process.stderr.write(
    `Skilling-session-end error: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.stdout.write('{}\n');
  process.exit(0);
});
