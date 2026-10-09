/** Reduce Codex JSONL to fixed, content-free progress labels. Never publish item text. */
const itemLabels = new Map([
  ['reasoning', 'analyzing'],
  ['web_search', 'searching'],
  ['agent_message', 'preparing-output'],
]);

export function safeAgentProgress(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  if (event.type === 'turn.started') return 'turn-started';
  if (event.type === 'turn.completed') return 'turn-completed';
  if (event.type === 'turn.failed') return 'turn-failed';
  if (event.type !== 'item.started' && event.type !== 'item.completed') return null;
  const label = itemLabels.get(event.item?.type);
  if (!label) return null;
  return `${label}-${event.type === 'item.started' ? 'started' : 'completed'}`;
}

export function parseAgentEventLine(line) {
  if (typeof line !== 'string' || line.length > 128 * 1024) return null;
  try { return safeAgentProgress(JSON.parse(line)); } catch { return null; }
}
