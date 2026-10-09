import test from 'node:test';
import assert from 'node:assert/strict';
import { safeActivity } from './activity.mjs';

test('activity events expose only bounded deterministic tokens', () => {
  const event = safeActivity('engineering-stage', {
    task: 'search-sort', status: 'completed', role: 'writer',
    message: 'private model output', secret: 'token',
  }, '2026-10-09T00:00:00.000Z');
  assert.equal(event.task, 'search-sort');
  assert.equal(event.status, 'completed');
  assert.equal(event.message, undefined);
  assert.equal(event.secret, undefined);
  assert.equal(safeActivity('model-start', { role: '../private' }).role, null);
  assert.throws(() => safeActivity('arbitrary-text', {}), /Unknown/);
});
