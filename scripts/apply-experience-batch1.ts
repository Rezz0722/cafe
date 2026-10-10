/** Bounded maintenance operation: dry-run by default; no accounts, schema or taxonomy created.
 * Execute only from the protected released maintenance image, after backup.
 * KUCAFE_RESEARCH_ACTOR_ID=<existing active admin UUID> node --import tsx --conditions=react-server scripts/apply-experience-batch1.ts [--review=3|--review=4] [--apply]
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, closeDb, withDbTransaction } from '../src/db/connection'
import { appUser, auditLog, place, placeAttribute } from '../src/db/schema'
import { patchPlaceAttributes } from '../src/core/places/manage'
import { researchAction, type ResearchAttribute } from '../src/core/experience/researchGuard'

const args = process.argv.slice(2)
assert.ok(new Set(args).size === args.length && args.every(a => a === '--apply' || a === '--review=3' || a === '--review=4'), 'Only --apply and one fixed review are supported')
assert.ok(!(args.includes('--review=3') && args.includes('--review=4')), 'Select only one review')
const apply = args.includes('--apply')
const reviewNumber = args.includes('--review=4') ? 4 : args.includes('--review=3') ? 3 : 2
const reviewDate = reviewNumber === 4 ? '2026-10-10' : '2026-10-07'
const packetDate = reviewDate.replaceAll('-', '')
const targets: Record<number, string> = reviewNumber === 4 ? { 243: 'quiet' } : reviewNumber === 3 ? { 237: 'outdoor' } : { 219: 'open_late', 284: 'open_late' }
const targetIds = Object.keys(targets).map(Number).sort((a, b) => a - b)
const batchId = `experience-01-${packetDate}-review${reviewNumber}`
const expires = reviewNumber === 4 ? '2026-11-01T00:00:00Z' : '2026-12-01T00:00:00Z'
assert.ok(Date.now() >= Date.parse(`${reviewDate}T00:00:00Z`) && Date.now() < Date.parse(expires), 'Research packet requires fresh review before use')
if (apply && reviewNumber === 4) assert.equal(process.env.KUCAFE_BACKUP_VERIFIED, '1', 'Verify fresh backup before apply')
const root = new URL('../docs/research/', import.meta.url)
const baseline = JSON.parse(readFileSync(new URL('KUCAFE_EXPERIENCE_BATCH_01_20261007.json', root), 'utf8'))
const review = JSON.parse(readFileSync(new URL(`KUCAFE_EXPERIENCE_REVIEW${reviewNumber}_${packetDate}.json`, root), 'utf8'))
assert.equal(review.batchId, batchId)
assert.equal(baseline.batchId, 'experience-01-20261007')
const candidates = review.records.filter((r: { decision: string }) => r.decision === 'ready-for-editorial-candidate')
assert.deepEqual(candidates.map((r: { placeId: number }) => r.placeId).sort((a: number, b: number) => a - b), targetIds)
for (const r of candidates) {
  assert.equal(r.attributeId, targets[r.placeId]); assert.equal(r.candidateValue, 1)
  assert.ok(r.sourceUrls.length > 0 && r.sourceUrls.every((u: string) => new URL(u).protocol === 'https:'))
}
const actorId = process.env.KUCAFE_RESEARCH_ACTOR_ID
assert.ok(actorId, 'An existing authorized admin UUID is required')
try {
  const results = await withDbTransaction(async () => {
    const db = getDb()
    const [actor] = await db.select({ id: appUser.id, role: appUser.role, status: appUser.status, mustChangePassword: appUser.mustChangePassword }).from(appUser).where(eq(appUser.id, actorId)).for('update')
    assert.ok(actor && actor.role === 'admin' && actor.status === 'active' && !actor.mustChangePassword, 'Actor is not an active authorized admin')
    // Lock ALL places in a stable order before evaluating or writing anything.
    const places = await db.select({ id: place.id, name: place.name, instagram: place.instagram, slug: place.slug, address: place.address, lat: place.lat, lng: place.lng, revision: place.revision, status: place.status }).from(place).where(inArray(place.id, targetIds)).orderBy(place.id).for('update')
    assert.equal(places.length, targetIds.length)
    const rows = await db.select().from(placeAttribute).where(inArray(placeAttribute.placeId, targetIds)).for('update')
    const plans = []
    for (const r of candidates) {
      const before = reviewNumber === 4 ? r : baseline.records.find((b: { placeId: number }) => b.placeId === r.placeId)
      assert.ok(before, 'Missing baseline')
      const p = places.find(p => p.id === r.placeId)!
      if (reviewNumber === 4) {
        assert.equal(p.name, r.name, 'Name changed since research')
        assert.equal(p.instagram, r.instagram, 'Instagram changed since research')
      }
      if (r.identityGeometry) {
        assert.equal(Number(p.lat), r.identityGeometry.databaseLatitude, 'Latitude changed since research')
        assert.equal(Number(p.lng), r.identityGeometry.databaseLongitude, 'Longitude changed since research')
      }
      const attributes: ResearchAttribute[] = rows.filter(a => a.placeId === r.placeId).map(a => ({ id: a.attributeId, value: a.value, confidence: a.confidence, source: a.source, verifiedAt: a.verifiedAt?.toISOString() ?? null }))
      const limit = reviewNumber === 4 ? 'quiet not guaranteed during events or at all hours; review 2026-09-19' : reviewNumber === 3 ? 'current outdoor availability not guaranteed' : 'current hours not guaranteed'
      const note = `${batchId}; candidate only; reviewed ${reviewDate}; ${r.sourceUrls.join(' ')}; ${limit}`
      assert.ok(note.length <= 500)
      const audits = await db.select({ after: auditLog.after }).from(auditLog).where(and(eq(auditLog.entity, 'place'), eq(auditLog.entityId, String(p.id)), eq(auditLog.action, 'place.attributes.patch')))
      const batchAudit = audits.some(a => (a.after as { evidenceNote?: string } | null)?.evidenceNote === note)
      const action = researchAction({ slug: before.slug, ...before.baseline }, { ...p, attributes }, batchAudit, r.attributeId)
      plans.push({ placeId: p.id, attributeId: r.attributeId as string, action, note })
    }
    if (apply) for (const plan of plans) if (plan.action === 'add') {
      const result = await patchPlaceAttributes(plan.placeId, [{ attributeId: plan.attributeId, value: 1 }], { userId: actor.id, label: 'Authorized editorial maintenance / research batch 01' }, 'editorial', plan.note)
      assert.ok(result.ok, result.error ?? 'Patch failed')
    }
    return plans.map(({ placeId, action }) => ({ placeId, action, applied: apply && action === 'add' }))
  })
  console.log(JSON.stringify({ batchId, mode: apply ? 'apply' : 'dry-run', results }))
} finally { await closeDb() }
