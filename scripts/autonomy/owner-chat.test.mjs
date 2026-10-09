import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answerNextOwnerMessage, validateOwnerMessage } from './owner-chat.mjs';

const valid = { id: '1791510000000-12345678-1234-1234-1234-123456789abc', text: 'الان روی چه کاری هستی؟', createdAt: '2026-10-09T00:00:00.000Z' };
test('only bounded owner messages enter the status assistant', () => {
  assert.deepEqual(validateOwnerMessage(valid), { ...valid, kind: 'question' });
  assert.equal(validateOwnerMessage({ ...valid, kind: 'work' }).kind, 'work');
  assert.equal(validateOwnerMessage({ ...valid, kind: 'deploy-now' }), null);
  assert.equal(validateOwnerMessage({ ...valid, id: '../../secrets' }), null);
  assert.equal(validateOwnerMessage({ ...valid, text: 'x'.repeat(2001) }), null);
  assert.equal(validateOwnerMessage({ ...valid, createdAt: 'not-a-date' }), null);
});
test('quota wait is recorded without pretending to answer; later retry can answer', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kucafe-owner-chat-'));
  const inbox = join(root, 'messages');
  const replies = join(root, 'replies');
  try {
    await mkdir(inbox); await mkdir(replies);
    await writeFile(join(inbox, `${valid.id}.json`), JSON.stringify(valid));
    const events = [];
    const base = { bridgeDir: root, snapshot: { engineering: [{ id: 'search-sort', status: 'completed' }] }, record: (...args) => events.push(args) };
    const waiting = await answerNextOwnerMessage({ ...base, quota: async () => ({}), quotaDecision: () => ({ allowed: false, reason: 'quota-reserve', retryAt: 1791547907000 }), agent: async () => { throw Error('must not run'); } });
    assert.deepEqual(waiting, { status: 'deferred', reason: 'quota-reserve', retryAt: 1791547907000 });
    assert.equal(events.at(-1)[0], 'message-deferred');
    const answered = await answerNextOwnerMessage({ ...base, quota: async () => ({}), quotaDecision: () => ({ allowed: true }), agent: async () => ({ answer: 'صف مصوب تکمیل شده است.' }) });
    assert.deepEqual(answered, { status: 'answered' });
    const saved = JSON.parse(await readFile(join(replies, `${valid.id}.json`), 'utf8'));
    assert.equal(saved.answer, 'صف مصوب تکمیل شده است.');
    assert.equal((await answerNextOwnerMessage({ ...base, quota: async () => ({}), quotaDecision: () => ({ allowed: true }), agent: async () => { throw Error('must not run twice'); } })).status, 'idle');
  } finally { await rm(root, { recursive: true, force: true }); }
});
