import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  discoverWorkspaceSkillsRoot,
  isUnresolvedTemplatePath,
  loadConfig,
  resolveBundledSkillsRoot,
} from './config.js';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('config skills root resolution', () => {
  const savedEnv: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    for (const key of Object.keys(savedEnv)) delete savedEnv[key];
  });

  function stashEnv(key: string): void {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  }

  it('detects unresolved template paths', () => {
    assert.equal(isUnresolvedTemplatePath('${workspaceFolder}/.agents/skills'), true);
    assert.equal(isUnresolvedTemplatePath('/tmp/.agents/skills'), false);
  });

  it('discovers .agents/skills by walking up from a nested cwd', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skilling-config-'));
    try {
      const skills = path.join(tmp, '.agents', 'skills');
      fs.mkdirSync(skills, { recursive: true });
      const nested = path.join(tmp, 'packages', 'app');
      fs.mkdirSync(nested, { recursive: true });
      assert.equal(discoverWorkspaceSkillsRoot(nested), skills);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('ignores literal ${workspaceFolder} in SKILL_ROOT and discovers from cwd', () => {
    stashEnv('SKILL_ROOT');
    stashEnv('SKILLING_SKILLS_ROOT');
    process.env['SKILL_ROOT'] = '${workspaceFolder}/.agents/skills';
    delete process.env['SKILLING_SKILLS_ROOT'];

    const cfg = loadConfig(repoRoot);
    assert.equal(cfg.skillsRoot, path.join(repoRoot, '.agents', 'skills'));
  });

  it('falls back to bundled catalog when cwd has no workspace skills', () => {
    stashEnv('SKILL_ROOT');
    stashEnv('SKILLING_SKILLS_ROOT');
    delete process.env['SKILL_ROOT'];
    delete process.env['SKILLING_SKILLS_ROOT'];

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skilling-config-empty-'));
    try {
      const bundled = resolveBundledSkillsRoot();
      assert.ok(bundled);
      const cfg = loadConfig(tmp);
      assert.equal(cfg.skillsRoot, bundled);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
