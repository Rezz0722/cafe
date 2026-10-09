/** Fail-closed recovery gate for GitHub's self-hosted production runner. */
export function recoveryDecision({ runner, workerActive, deployActive, state, now = Date.now() }) {
  if (!runner || !['online', 'offline'].includes(runner.status)) return { action: 'unknown', next: state };
  if (runner.status === 'online') return { action: 'healthy', next: { ...state, offlineCount: 0 } };
  if (runner.busy || workerActive || deployActive) return { action: 'busy-skip', next: state };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(now));
  const prior = state.day === today ? state : { ...state, day: today, restartsToday: 0, offlineCount: 0 };
  const offlineCount = (prior.offlineCount ?? 0) + 1;
  const next = { ...prior, offlineCount };
  if (offlineCount < 2) return { action: 'observe', next };
  if (prior.restartsToday >= 2) return { action: 'daily-cap', next };
  if (Number.isFinite(prior.lastRestartAt) && now - prior.lastRestartAt < 30 * 60000) return { action: 'cooldown', next };
  return { action: 'restart', next: { ...next, offlineCount: 0, lastRestartAt: now, restartsToday: (prior.restartsToday ?? 0) + 1 } };
}
