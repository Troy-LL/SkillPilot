import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { importSkillFromAgents } from './import-skill.js';

describe('importSkillFromAgents', () => {
  it('imports find-skills from .agents into a temp skill root', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpilot-import-'));
    try {
      const result = importSkillFromAgents(repoRoot, 'find-skills', tmpRoot);
      assert.equal(result.skill_id, 'find-skills');
      assert.ok(fs.existsSync(path.join(tmpRoot, 'find-skills', 'SKILL.md')));
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
