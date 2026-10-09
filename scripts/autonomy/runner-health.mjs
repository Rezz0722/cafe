/** Public-safe projection of the one production runner; no GitHub credentials. */
export function runnerHealth(payload, at = new Date().toISOString()) {
  const runner = Array.isArray(payload?.runners) ? payload.runners.find(row => row?.name === 'kucafe-production-server-45-159-115-116') : null;
  if (!runner) return { status: 'missing', busy: false, observedAt: at };
  return { status: runner.status === 'online' ? 'online' : runner.status === 'offline' ? 'offline' : 'unknown', busy: runner.busy === true, observedAt: at };
}
