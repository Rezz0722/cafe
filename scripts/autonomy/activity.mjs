/** Bounded, deterministic controller events. Never publish model prose or raw logs. */
import { appendFileSync, chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const privateFile = '/var/lib/kucafe-autonomy/activity.jsonl';
const publicFile = '/var/www/html/kucafe-autonomy/activity.json';
const allowedTypes = new Set([
  'cycle-start', 'cycle-end', 'engineering-stage', 'engineering-empty',
  'research-stage', 'research-empty', 'model-start', 'model-end',
  'message-received', 'message-answer', 'message-deferred', 'model-progress',
]);
const token = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(value) ? value : null;

export function safeActivity(type, detail = {}, at = new Date().toISOString()) {
  if (!allowedTypes.has(type)) throw Error('Unknown activity type');
  return {
    id: randomUUID(), at, type,
    task: token(detail.task), status: token(detail.status), role: token(detail.role),
  };
}

export function recordActivity(type, detail = {}) {
  const event = safeActivity(type, detail);
  appendFileSync(privateFile, JSON.stringify(event) + '\n', { mode: 0o600 });
  // Keep a bounded private trail and a smaller public projection. No secrets enter either.
  if (statSync(privateFile).size > 1024 * 1024) {
    const lines = readFileSync(privateFile, 'utf8').trimEnd().split('\n').slice(-1000);
    writeFileSync(privateFile + '.tmp', lines.join('\n') + '\n', { mode: 0o600 });
    renameSync(privateFile + '.tmp', privateFile);
  }
  if (!existsSync(resolve(publicFile, '..'))) return event;
  const rows = readFileSync(privateFile, 'utf8').trimEnd().split('\n').slice(-80).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  writeFileSync(publicFile + '.tmp', JSON.stringify({ updatedAt: event.at, events: rows }, null, 2) + '\n', { mode: 0o644 });
  chmodSync(publicFile + '.tmp', 0o644);
  renameSync(publicFile + '.tmp', publicFile);
  return event;
}
