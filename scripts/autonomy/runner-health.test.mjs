import test from 'node:test';
import assert from 'node:assert/strict';
import { runnerHealth } from './runner-health.mjs';

test('runner health exposes only bounded status, not API payload', () => {
  const at = '2026-10-09T00:00:00.000Z';
  assert.deepEqual(runnerHealth({ runners: [{ name: 'kucafe-production-server-45-159-115-116', status: 'offline', busy: false, token: 'private' }] }, at), { status: 'offline', busy: false, observedAt: at });
  assert.equal(runnerHealth({ runners: [] }, at).status, 'missing');
  assert.equal(runnerHealth(null, at).status, 'missing');
});
