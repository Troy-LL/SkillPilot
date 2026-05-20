import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { readSession, writeSession } from './session-store.js';
import { beginTask, endTask, getSession, loadSkillEpisode } from './task-lifecycle.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentsSkills = path.join(repoRoot, '.agents', 'skills');
const config = loadConfig(repoRoot, agentsSkills);

describe('task-lifecycle', () => {
  it('beginTask selects find-skills for discovery prompt', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'npx skills find install a skill from skills.sh for API testing',
      });
      assert.equal(result.skill_id, 'find-skills');
      assert.ok(result.correlation_id);
      assert.ok(result.body.length > 0);
      assert.ok(result.token_estimate > 0);
      assert.ok(result.ttl_hint >= 0);
      assert.ok(result.summary);
      assert.ok(result.title);
      assert.equal('alternatives' in result, false);
      const session = readSession(repo);
      assert.equal(session?.correlation_id, result.correlation_id);
      assert.equal(session?.summary, result.summary);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('response_detail full includes alternatives when present', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-full-'));
    try {
      const result = beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for API testing',
        response_detail: 'full',
      });
      assert.ok(result.skill_id);
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('getSession include_body loads skill text', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-body-'));
    try {
      beginTask(agentsSkills, repo, config, {
        prompt: 'find a skill for deployment',
        skill_id: 'find-skills',
      });
      const session = getSession(agentsSkills, repo, config, { include_body: true });
      assert.equal(session.active, true);
      if (session.active) {
        assert.ok(session.body && session.body.length > 0);
        assert.ok(session.summary);
      }
      endTask(repo);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  it('end_previous cleans up prior session', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-task-'));
    try {
      const first = loadSkillEpisode(agentsSkills, 'com-skillpilot-orchestrator', config);
      writeSession(repo, {
        skill_id: first.skill_id,
        title: first.title,
        summary: 'Using orchestrator',
        rationale: 'test',
        confidence: 1,
        correlation_id: first.correlation_id,
        ttl_ms: first.ttl_ms,
        started_at: new Date().toISOString(),
      });
      const second = beginTask(agentsSkills, repo, config, {
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
