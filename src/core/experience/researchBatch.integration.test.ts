import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readFileSync } from 'node:fs'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/connection'
import { appUser, attribute, auditLog, place, placeAttribute } from '@/db/schema'

test('CI-only research batch: dry-run, authorization, conflicts, rollback and audited retry', { skip: process.env.KUCAFE_RESEARCH_DB_TEST !== '1' }, async t => {
  // Fixed production IDs are fixtures ONLY in a fresh hosted-CI database. Never on this server.
  assert.equal(process.env.GITHUB_ACTIONS, 'true')
  const url = new URL(process.env.DATABASE_URL!)
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.pathname, '/kucafe')
  if (Date.now() >= Date.parse('2026-12-01T00:00:00Z')) {
    // Archived evidence must fail closed, without breaking unrelated future CI builds.
    await assert.rejects(promisify(execFile)(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/apply-experience-batch1.ts', '--apply'], { env: process.env, timeout: 60000 }), /requires fresh review/)
    return
  }
  const db = getDb(), actor = randomUUID(), ids = [219, 284, 237]
  assert.equal((await db.select().from(place).where(inArray(place.id, ids))).length, 0, 'Fixture IDs must not exist')
  const packet = JSON.parse(readFileSync('docs/research/KUCAFE_EXPERIENCE_BATCH_01_20261007.json', 'utf8'))
  const run = (apply = false) => promisify(execFile)(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/apply-experience-batch1.ts', ...(apply ? ['--apply'] : [])], { env: { ...process.env, KUCAFE_RESEARCH_ACTOR_ID: actor }, timeout: 60000 })
  const targets = () => db.select().from(placeAttribute).where(and(inArray(placeAttribute.placeId, ids), eq(placeAttribute.attributeId, 'open_late')))
  const audits = () => db.select().from(auditLog).where(eq(auditLog.actorUserId, actor))
  let created = false
  try {
    await db.insert(appUser).values({ id: actor, role: 'admin', status: 'active', name: 'CI research operator' })
    await db.insert(attribute).ignore().values([{ id: 'desserts', labelFa: 'CI dessert', kind: 'intent' }, { id: 'open_late', labelFa: 'CI late', kind: 'amenity' }, { id: 'outdoor', labelFa: 'CI outdoor', kind: 'amenity' }])
    for (const id of ids) {
      const r = packet.records.find((r: { placeId: number }) => r.placeId === id)
      await db.insert(place).values({ id, slug: r.slug, name: 'CI research fixture', nameNormalized: 'ci', address: r.baseline.address, revision: r.baseline.revision, status: 'published', ...(id === 237 ? { lat: '36.3007477', lng: '59.4961814' } : {}) })
      created = true
      for (const a of r.baseline.attributes) await db.insert(placeAttribute).values({ placeId: id, attributeId: a.id, value: a.value, confidence: a.confidence, source: a.source, verifiedAt: new Date(a.verifiedAt) })
    }
    await t.test('dry-run does not write', async () => { await run(); assert.equal((await targets()).length, 0); assert.equal((await audits()).length, 0) })
    await t.test('blocked actor cannot apply', async () => { await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, actor)); await assert.rejects(run(true)); assert.equal((await targets()).length, 0); await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, actor)) })
    await t.test('second-place conflict prevents all writes', async () => { await db.update(place).set({ revision: 1 }).where(eq(place.id, 284)); await assert.rejects(run(true)); assert.equal((await targets()).length, 0); assert.equal((await audits()).length, 0); await db.update(place).set({ revision: 0 }).where(eq(place.id, 284)) })
    await t.test('late DB failure rolls back the first patch and its audit', async () => {
      await db.execute(`CREATE TRIGGER ci_research_failure BEFORE INSERT ON place_attribute FOR EACH ROW BEGIN IF NEW.place_id=284 AND NEW.attribute_id='open_late' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CI deliberate failure'; END IF; END`)
      try { await assert.rejects(run(true)); assert.equal((await targets()).length, 0); assert.equal((await audits()).length, 0) } finally { await db.execute('DROP TRIGGER ci_research_failure') }
    })
    await t.test('successful apply is additive and retry creates no duplicates', async () => {
      await run(true); assert.equal((await targets()).length, 2); assert.equal((await audits()).length, 2)
      await run(true); assert.equal((await targets()).length, 2); assert.equal((await audits()).length, 2)
      const original = await db.select().from(placeAttribute).where(and(inArray(placeAttribute.placeId, ids), eq(placeAttribute.attributeId, 'desserts')))
      assert.equal(original.length, 3)
      for (const a of original) { assert.equal(a.value, 1); assert.equal(a.confidence, 75); assert.equal(a.verifiedAt?.toISOString(), '2026-09-28T12:11:13.000Z') }
    })
    await t.test('review3 writes outdoor only, preserves prior batch and is retry-safe', async () => {
      const runReview3 = (apply = false) => promisify(execFile)(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/apply-experience-batch1.ts', '--review=3', ...(apply ? ['--apply'] : [])], { env: { ...process.env, KUCAFE_RESEARCH_ACTOR_ID: actor }, timeout: 60000 })
      await runReview3(); assert.equal((await audits()).length, 2)
      await db.update(place).set({ lng: '59.5000000' }).where(eq(place.id, 237))
      await assert.rejects(runReview3(true)); assert.equal((await audits()).length, 2)
      await db.update(place).set({ lng: '59.4961814' }).where(eq(place.id, 237))
      await runReview3(true); await runReview3(true)
      const [outdoor] = await db.select().from(placeAttribute).where(and(eq(placeAttribute.placeId, 237), eq(placeAttribute.attributeId, 'outdoor')))
      assert.equal(outdoor?.value, 1); assert.equal(outdoor?.confidence, 75)
      assert.equal((await targets()).length, 2); assert.equal((await audits()).length, 3)
    })
  } finally {
    if (created) await db.delete(place).where(inArray(place.id, ids))
    await db.delete(auditLog).where(eq(auditLog.actorUserId, actor)); await db.delete(appUser).where(eq(appUser.id, actor)); await closeDb()
  }
})
