import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSkillMarkdown } from './parse.js';

const VALID = `---
id: test-skill
title: Test
summary: One line summary for tests.
tags:
  - demo
---

## Body

Do the thing.
`;

describe('parseSkillMarkdown', () => {
  it('parses valid front matter and body', () => {
    const { meta, body } = parseSkillMarkdown(VALID, 'test-skill');
    assert.equal(meta.id, 'test-skill');
    assert.equal(meta.title, 'Test');
    assert.equal(meta.summary, 'One line summary for tests.');
    assert.deepEqual(meta.tags, ['demo']);
    assert.match(body, /Do the thing/);
  });

  it('rejects folder name mismatch', () => {
    assert.throws(
      () => parseSkillMarkdown(VALID, 'wrong-folder'),
      /does not match folder name/,
    );
  });

  it('rejects missing front matter', () => {
    assert.throws(() => parseSkillMarkdown('# no yaml\n', 'test-skill'), /front matter/);
  });
});
