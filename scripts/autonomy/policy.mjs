/** Pure supervisor policy: no guessed quotas, billing actions or production writes. */
export function quotaDecision(result, now = Date.now()) {
  if (!result || typeof result !== 'object') return { allowed: false, reason: 'quota-unknown', retryAt: now + 3600000 };
  const buckets = result.rateLimitsByLimitId ? Object.values(result.rateLimitsByLimitId) : [result.rateLimits];
  const validWindow = w => w && typeof w.usedPercent === 'number' && Number.isFinite(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100 && typeof w.resetsAt === 'number' && Number.isFinite(w.resetsAt);
  if (!buckets.length || buckets.some(b => !b || !validWindow(b.primary) || (b.secondary != null && !validWindow(b.secondary))))
    return { allowed: false, reason: 'quota-unknown', retryAt: now + 3600000 };
  const blocked = [];
  for (const b of buckets) {
    if (b.spendControlReached || b.rateLimitReachedType || result.ordinaryUsageAllowed === false)
      blocked.push(Number(b.primary.resetsAt) * 1000);
    for (const [name, w] of [['primary', b.primary], ['secondary', b.secondary]]) {
      if (w && w.usedPercent >= (name === 'primary' ? 80 : 90)) blocked.push(Number(w.resetsAt) * 1000);
    }
  }
  if (!blocked.length) return { allowed: true, reason: 'within-reserve', retryAt: now };
  const valid = blocked.filter(t => Number.isFinite(t) && t > now);
  return { allowed: false, reason: 'quota-reserve', retryAt: Math.max(now + 3600000, ...valid) + 60000 };
}

export function validateResearch(data, ids, now = Date.now()) {
  if (!data || typeof data.summary !== 'string' || !Array.isArray(data.claims) || !Array.isArray(data.unknown)) throw Error('Invalid researcher output');
  if (JSON.stringify(data).length > 60000) throw Error('Output too large');
  for (const c of data.claims) {
    if (!ids.includes(c.placeId) || !c.branchMatch || !['work','date','photography','specialty_coffee','calm','gathering','birthday','outdoor','open_late','breakfast','desserts'].includes(c.attribute))
      throw Error('Out-of-scope or unmatched claim');
    const url = new URL(c.evidenceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || !['neshan.org','snappfood.ir','google.com','maps.google.com','instagram.com','restaurantguru.com','t.me'].some(h => url.hostname === h || url.hostname.endsWith('.' + h)))
      throw Error('Unapproved evidence source');
    if (!c.publishedAt || !Number.isFinite(Date.parse(c.publishedAt))) throw Error('Dated evidence required for a claim');
    const published = Date.parse(c.publishedAt);
    if (published > now || now - published > 90 * 86400000) throw Error('Future or stale evidence belongs in unknown');
    if (typeof c.excerpt !== 'string' || c.excerpt.length > 1200) throw Error('Invalid evidence excerpt');
  }
  if (/BEGIN .*PRIVATE KEY|DATABASE_URL|x-api-key|Bearer\s+[A-Za-z0-9]|[A-Za-z0-9_-]{45,}/i.test(JSON.stringify(data)))
    throw Error('Potential secret; private quarantine only');
  return data;
}

export function eligibleTask(queue, state, now = Date.now()) {
  if (state.paused || state.nextEligibleAt > now) return null;
  return queue.find(t => !state.tasks[t.id] || (state.tasks[t.id].status === 'retry' && state.tasks[t.id].attempts < 3)) ?? null;
}
