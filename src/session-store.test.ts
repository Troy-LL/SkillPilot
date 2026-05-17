import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  clearSession,
  readSession,
  resolveSessionPath,
  SESSION_SCHEMA_VERSION,
  writeSession,
} from './session-store.js';

describe('session-store', () => {
  it('writes, reads, and clears session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-session-'));
    try {
      writeSession(repo, {
        skill_id: 'test-skill',
        correlation_id: '00000000-0000-4000-8000-000000000001',
        ttl_ms: 300_000,
        started_at: '2026-05-14T00:00:00.000Z',
        phase: 'implement',
      });
      const file = resolveSessionPath(repo);
      assert.ok(fs.existsSync(file));
      const s = readSession(repo);
      assert.ok(s);
      assert.equal(s!.version, SESSION_SCHEMA_VERSION);
      assert.equal(s!.skill_id, 'test-skill');
      assert.equal(s!.phase, 'implement');
      clearSession(repo);
      assert.equal(readSession(repo), null);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
