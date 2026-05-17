import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolveCleanupScript(extensionPath: string): { script: string; cwd: string } {
  const repoRoot = path.join(extensionPath, '..');
  const candidates = [
    path.join(extensionPath, 'scripts', 'extension-cleanup.mjs'),
    path.join(repoRoot, 'scripts', 'extension-cleanup.mjs'),
  ];
  for (const script of candidates) {
    if (fs.existsSync(script)) {
      return { script, cwd: repoRoot };
    }
  }
  throw new Error(
    'extension-cleanup.mjs not found. Open the SkillPilot repo or install the extension from this repository.',
  );
}

export function runMcpCleanup(
  correlationId: string,
  serverEntry: string,
  skillRoot: string | undefined,
  extensionPath: string,
): Promise<void> {
  const { script, cwd } = resolveCleanupScript(extensionPath);
  const args = [script, correlationId, serverEntry];
  if (skillRoot) args.push(skillRoot);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', (c) => {
      stderr += String(c);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `cleanup exited ${code}`));
    });
  });
}
