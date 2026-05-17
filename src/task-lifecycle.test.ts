import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readSession, writeSession } from './session-store.js';
import { beginTask, endTask, loadSkillEpisode } from './task-lifecycle.js';

const repoSkills = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');

describe('task-lifecycle', () => {
  it('beginTask selects find-skills for discovery prompt', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const result = beginTask(repoSkills, repo, {
        prompt: 'find a skill for API testing and deployment',
      });
      assert.equal(result.skill_id, 'find-skills');
      assert.ok(result.correlation_id);
      assert.ok(result.body.includes('Find Skills'));
      const session = readSession(repo);
      assert.equal(session?.correlation_id, result.correlation_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('end_previous cleans up prior session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const first = loadSkillEpisode(repoSkills, 'com-skillpilot-orchestrator');
      writeSession(repo, {
        skill_id: first.skill_id,
        correlation_id: first.correlation_id,
        ttl_ms: first.ttl_ms,
        started_at: new Date().toISOString(),
      });
      const second = beginTask(repoSkills, repo, {
        prompt: 'find a skill for linting',
        end_previous: true,
      });
      assert.equal(second.previous_ended, true);
      assert.notEqual(second.correlation_id, first.correlation_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
