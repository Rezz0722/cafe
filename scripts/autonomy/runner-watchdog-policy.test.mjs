import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryDecision } from './runner-watchdog-policy.mjs';

const now = Date.parse('2026-10-09T12:00:00Z');
test('runner recovery requires two offline observations, never interrupts work and is bounded', () => {
  const base = { day: '2026-10-09', restartsToday: 0, offlineCount: 0, lastRestartAt: 0 };
  const offline = { status: 'offline', busy: false };
  const first = recoveryDecision({ runner: offline, workerActive: false, deployActive: false, state: base, now });
  assert.equal(first.action, 'observe');
  assert.equal(recoveryDecision({ runner: offline, workerActive: true, deployActive: false, state: first.next, now }).action, 'busy-skip');
  assert.equal(recoveryDecision({ runner: offline, workerActive: false, deployActive: true, state: first.next, now }).action, 'busy-skip');
  const restart = recoveryDecision({ runner: offline, workerActive: false, deployActive: false, state: first.next, now });
  assert.equal(restart.action, 'restart');
  assert.equal(restart.next.restartsToday, 1);
  assert.equal(recoveryDecision({ runner: offline, workerActive: false, deployActive: false, state: { ...restart.next, offlineCount: 2 }, now: now + 60000 }).action, 'cooldown');
  assert.equal(recoveryDecision({ runner: offline, workerActive: false, deployActive: false, state: { ...restart.next, offlineCount: 2, restartsToday: 2 }, now: now + 3600000 }).action, 'daily-cap');
  assert.equal(recoveryDecision({ runner: { status: 'online', busy: false }, workerActive: false, deployActive: false, state: restart.next, now }).next.offlineCount, 0);
  assert.equal(recoveryDecision({ runner: null, workerActive: false, deployActive: false, state: base, now }).action, 'unknown');
});
