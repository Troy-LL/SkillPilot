import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CorrelationRegistry } from './correlation-registry.js';

describe('CorrelationRegistry', () => {
  it('adds and deletes ids', () => {
    const reg = new CorrelationRegistry(3);
    reg.add('a');
    assert.equal(reg.has('a'), true);
    assert.equal(reg.delete('a'), true);
    assert.equal(reg.has('a'), false);
  });

  it('evicts oldest when at capacity', () => {
    const reg = new CorrelationRegistry(2);
    reg.add('first');
    reg.add('second');
    reg.add('third');
    assert.equal(reg.has('first'), false);
    assert.equal(reg.has('second'), true);
    assert.equal(reg.has('third'), true);
    assert.equal(reg.size, 2);
  });

  it('does not duplicate add for same id', () => {
    const reg = new CorrelationRegistry(2);
    reg.add('x');
    reg.add('x');
    assert.equal(reg.size, 1);
  });
});
