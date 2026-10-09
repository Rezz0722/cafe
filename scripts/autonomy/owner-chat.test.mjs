import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerMessage } from './owner-chat.mjs';

const valid = { id: '1791510000000-12345678-1234-1234-1234-123456789abc', text: 'الان روی چه کاری هستی؟', createdAt: '2026-10-09T00:00:00.000Z' };
test('only bounded owner messages enter the status assistant', () => {
  assert.deepEqual(validateOwnerMessage(valid), valid);
  assert.equal(validateOwnerMessage({ ...valid, id: '../../secrets' }), null);
  assert.equal(validateOwnerMessage({ ...valid, text: 'x'.repeat(2001) }), null);
  assert.equal(validateOwnerMessage({ ...valid, createdAt: 'not-a-date' }), null);
});
