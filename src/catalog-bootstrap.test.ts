import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BOOTSTRAP_SKILL_IDS, ensureBootstrapCatalog } from './catalog-bootstrap.js';
import { resolveBundledSkillsRoot } from './config.js';

describe('catalog-bootstrap', () => {
  it('ensureBootstrapCatalog is idempotent', () => {
    const bundled = resolveBundledSkillsRoot();
    if (!bundled) return;

    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'Skilling-bootstrap-'));
    try {
      const destDir = path.join(repo, '.agents', 'skills');
      fs.mkdirSync(destDir, { recursive: true });

      const first = ensureBootstrapCatalog(repo);
      assert.ok(first.seeded.length > 0);
      for (const id of BOOTSTRAP_SKILL_IDS) {
        assert.ok(fs.existsSync(path.join(destDir, id, 'SKILL.md')));
      }

      const second = ensureBootstrapCatalog(repo);
      assert.deepEqual(second.seeded, []);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
