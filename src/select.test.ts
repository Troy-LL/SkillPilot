import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SkillFrontMatter } from './parse.js';
import { selectSkill } from './select.js';

const review: SkillFrontMatter = {
  id: 'com-Skilling-code-review',
  title: 'Lightweight code review',
  summary: 'Spot correctness, edge cases, and test gaps without nitpicking style unless asked.',
  tags: ['review', 'quality', 'security'],
};

const prBabysit: SkillFrontMatter = {
  id: 'com-Skilling-pr-babysit',
  title: 'PR babysitting loop',
  summary: 'Keep a PR merge-ready by triaging review comments, resolving conflicts, and fixing CI in order.',
  tags: ['pr', 'merge', 'ci'],
};

const candidates = [review, prBabysit];

describe('selectSkill', () => {
  it('picks code review for review-oriented prompt', () => {
    const r = selectSkill(candidates, {
      prompt: 'Please do a code review of this diff and find security issues',
    });
    assert.equal(r.skill_id, 'com-Skilling-code-review');
    assert.ok(r.confidence > 0);
  });

  it('picks PR babysit for merge/CI prompt', () => {
    const r = selectSkill(candidates, {
      prompt: 'PR is failing CI and has merge conflicts, help babysit the PR',
    });
    assert.equal(r.skill_id, 'com-Skilling-pr-babysit');
  });

  it('returns null when nothing matches', () => {
    const r = selectSkill(candidates, { prompt: 'xyzzy unrelated fluff' });
    assert.equal(r.skill_id, null);
    assert.equal(r.confidence, 0);
  });
});
