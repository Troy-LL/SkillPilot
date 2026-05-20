import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SkillPilotError } from './errors.js';
import { shapeSkillBody, stripInternalOnlySections } from './shape-body.js';

describe('shapeSkillBody', () => {
  it('strips internal-only blocks', () => {
    const raw = `# Skill\n\n<!-- internal-only -->\nsecret\n<!-- /internal-only -->\n\nVisible.`;
    assert.equal(stripInternalOnlySections(raw).includes('secret'), false);
    const shaped = shapeSkillBody(raw, 8192);
    assert.ok(shaped.body.includes('Visible.'));
    assert.ok(shaped.body.startsWith('> The following skill'));
  });

  it('throws BODY_TOO_LARGE when over limit', () => {
    const huge = 'x'.repeat(9000);
    assert.throws(() => shapeSkillBody(huge, 100), (e) => {
      return e instanceof SkillPilotError && e.code === 'BODY_TOO_LARGE';
    });
  });
});
