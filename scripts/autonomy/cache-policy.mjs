// Reproducible KuCafe compile snapshots and terminal descendants of its exact runtime marker.
const marker = '[runtime 6/8] COPY --from=builder --chown=10001:10001 /app/.next/DEPLOYMENT_ID ./.next/DEPLOYMENT_ID';
export function eligibleCaches(rows, now = Date.now()) {
  if (!Array.isArray(rows)) return [];
  const own = new Set(rows.filter(r => r?.Description === marker).map(r => r.ID));
  for (let i=0;i<rows.length;i++) {
    let changed=false;
    for (const r of rows) if (!own.has(r?.ID) && (r?.Parents ?? []).some(p=>own.has(p))) {own.add(r.ID);changed=true;}
    if (!changed) break;
  }
  const referenced = new Set(rows.flatMap(r=>r?.Parents ?? []));
  return rows.filter(r => r && /^[a-z0-9]{20,40}$/.test(r.ID ?? '') &&
    r.Reclaimable === true && r.Shared === false &&
    ((r.Mutable === true && r.Description === 'mount / from exec /bin/sh -c npm run postinstall && npm run prebuild && npm run build:next &&     printf \'%s\\\\n\' "$NEXT_DEPLOYMENT_ID" > .next/DEPLOYMENT_ID') ||
     (own.has(r.ID) && !referenced.has(r.ID))) &&
    Number.isFinite(Date.parse(r.CreatedAt)) && now - Date.parse(r.CreatedAt) >= 600000
  ).slice(0, 8);
}
