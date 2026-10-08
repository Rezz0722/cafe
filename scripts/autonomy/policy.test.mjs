import test from 'node:test';
import assert from 'node:assert/strict';
import { quotaDecision, validateResearch, eligibleTask } from './policy.mjs';
const now = 1800000000000;
const bucket = (usedPercent, resetsAt = now / 1000 + 7200) => ({ primary: { usedPercent, resetsAt } });
test('unknown quota fails closed', () => assert.equal(quotaDecision(null, now).allowed, false));
test('uses exact future reset with reserve and no credit redemption', () => {
  const r = quotaDecision({ rateLimits: bucket(82) }, now);
  assert.equal(r.allowed, false); assert.equal(r.retryAt, now + 7200000 + 60000);
});
test('weekly and additional buckets respected', () => {
  assert.equal(quotaDecision({ rateLimitsByLimitId: { a: bucket(20), b: bucket(100) } }, now).allowed, false);
  assert.equal(quotaDecision({ rateLimits: { ...bucket(20), secondary: { usedPercent: 91, resetsAt: now / 1000 + 604800 } } }, now).allowed, false);
});
test('ordinary usage denial and missing telemetry block', () => {
  assert.equal(quotaDecision({ ordinaryUsageAllowed: false, rateLimits: bucket(20) }, now).allowed, false);
  assert.equal(quotaDecision({ rateLimitsByLimitId: {} }, now).allowed, false);
});
test('headroom permits a bounded cycle', () => assert.equal(quotaDecision({ rateLimits: bucket(20) }, now).allowed, true));
test('malformed secondary telemetry fails closed', () => {
  assert.equal(quotaDecision({ rateLimits: { ...bucket(20), secondary: { usedPercent: 'unknown', resetsAt: 0 } } }, now).allowed, false);
  assert.equal(quotaDecision({ rateLimits: { primary: { usedPercent: 20 } } }, now).allowed, false);
});
test('finished, blocked, paused and exhausted tasks do not loop', () => {
  const queue = [{ id: 'a' }];
  for (const status of ['needs-evidence','done','blocked','rejected','ready-for-review']) assert.equal(eligibleTask(queue, { tasks: { a: { status, attempts: 1 } } }, now), null);
  assert.equal(eligibleTask(queue, { paused: true, tasks: {} }, now), null);
  assert.equal(eligibleTask(queue, { tasks: { a: { status: 'retry', attempts: 3 } } }, now), null);
  assert.equal(eligibleTask(queue, { tasks: { a: { status: 'retry', attempts: 2 } } }, now).id, 'a');
});
test('unknown is allowed; fabricated date/identity/private URLs are rejected', () => {
  const good = { summary: 'No dated evidence', claims: [], unknown: ['Date unavailable'] };
  assert.equal(validateResearch(good, [119]), good);
  const c = { placeId: 119, attribute: 'outdoor', branchMatch: true, evidenceUrl: 'https://neshan.org/maps/places/test', publishedAt: '2026-10-01', excerpt: 'Example, not actual evidence' };
  assert.doesNotThrow(() => validateResearch({ ...good, claims: [c] }, [119]));
  for (const bad of [{...c, placeId: 999},{...c, publishedAt: ''},{...c, branchMatch: false},{...c, evidenceUrl: 'http://127.0.0.1/admin'},{...c, attribute: 'family'}]) assert.throws(() => validateResearch({ ...good, claims: [bad] }, [119]));
  assert.throws(() => validateResearch({ ...good, claims: [{...c, publishedAt:'2099-01-01'}] }, [119]));
  assert.throws(() => validateResearch({ ...good, claims: [{...c, publishedAt:'2020-01-01'}] }, [119]));
});
