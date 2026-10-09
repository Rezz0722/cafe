import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentEventLine, safeAgentProgress } from './agent-events.mjs';

test('Codex JSONL progress is reduced to fixed labels without leaking content', () => {
  assert.equal(parseAgentEventLine(JSON.stringify({ type: 'turn.started', private: 'secret' })), 'turn-started');
  assert.equal(parseAgentEventLine(JSON.stringify({ type: 'item.started', item: { type: 'web_search', query: 'secret' } })), 'searching-started');
  assert.equal(parseAgentEventLine(JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', text: 'secret' } })), 'analyzing-completed');
  assert.equal(parseAgentEventLine(JSON.stringify({ type: 'item.completed', item: { type: 'command_execution', command: 'secret' } })), null);
  assert.equal(parseAgentEventLine('not JSON'), null);
  assert.equal(parseAgentEventLine('x'.repeat(128 * 1024 + 1)), null);
  assert.equal(safeAgentProgress(null), null);
});
