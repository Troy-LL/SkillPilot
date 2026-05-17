import fs from 'node:fs';
import path from 'node:path';

export const SESSION_SCHEMA_VERSION = 1;

export type SkillSession = {
  version: typeof SESSION_SCHEMA_VERSION;
  skill_id: string;
  correlation_id: string;
  ttl_ms: number;
  started_at: string;
  phase?: string;
};

export function resolveSessionPath(repoRoot: string): string {
  return path.join(path.resolve(repoRoot), '.skillpilot', 'session.json');
}

export function readSession(repoRoot: string): SkillSession | null {
  const file = resolveSessionPath(repoRoot);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw) as SkillSession;
    if (data.version !== SESSION_SCHEMA_VERSION) return null;
    if (!data.skill_id || !data.correlation_id || !data.started_at) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSession(repoRoot: string, session: Omit<SkillSession, 'version'>): void {
  const dir = path.join(path.resolve(repoRoot), '.skillpilot');
  fs.mkdirSync(dir, { recursive: true });
  const full: SkillSession = { version: SESSION_SCHEMA_VERSION, ...session };
  fs.writeFileSync(resolveSessionPath(repoRoot), JSON.stringify(full, null, 2), 'utf8');
}

export function clearSession(repoRoot: string): void {
  const file = resolveSessionPath(repoRoot);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
