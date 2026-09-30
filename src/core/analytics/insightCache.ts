/** A single report snapshot; concurrent readers share one query, errors are not cached. */
export function createInsightCache<T>(load: () => Promise<T>, ttlMs: number, now = Date.now) {
  let snapshot: { value: T; generatedAt: number } | undefined
  let pending: Promise<{ value: T; generatedAt: number }> | undefined
  return () => {
    if (snapshot && now() - snapshot.generatedAt < ttlMs) return Promise.resolve(snapshot)
    if (pending) return pending
    // Deferring load also converts a synchronous failure into a rejected promise.
    pending = Promise.resolve().then(load).then(value => {
      snapshot = { value, generatedAt: now() }
      return snapshot
    }).finally(() => { pending = undefined })
    return pending
  }
}
