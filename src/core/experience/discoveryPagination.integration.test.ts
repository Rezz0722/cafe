import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { attribute, place, placeAttribute } from '@/db/schema'
import { countPlaces, listPlaceCards } from '@/core/places/queries'
import { EXPERIENCE_BY_SLUG } from './registry'
import { listExperienceCandidates } from './queries'

test('SSR discovery pages preserve global evidence rank and all eligible IDs', {
  skip: process.env.KUCAFE_DISCOVERY_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' && (url.pathname === '/kucafe_discovery_test' ||
    (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')), 'Disposable database required; production forbidden')
  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids: number[] = []
  const experience = EXPERIENCE_BY_SLUG.get('work')!
  try {
    await db.insert(attribute).ignore().values({ id: experience.primaryAttributeId, labelFa: 'QA work', kind: 'intent' })
    for (let i = 0; i < 75; i++) {
      const [result] = await db.insert(place).values({ slug: `qa-discovery-${suffix}-${i}`, name: `QA ${i}`,
        nameNormalized: `qa ${i}`, status: i === 74 ? 'draft' : 'published', qualityScore: i === 72 ? 0 : 80,
        priceMedian: i === 0 ? 0 : null })
      ids.push(result.insertId)
      await db.insert(placeAttribute).values({ placeId: result.insertId, attributeId: experience.primaryAttributeId,
        value: i === 73 ? 0 : i === 72 ? 2 : 1, confidence: 75, source: 'owner' })
    }
    const before = await db.select({ id: place.id, price: place.priceMedian, verified: place.lastVerifiedAt,
      sync: place.lastSourceSyncAt, updated: place.updatedAt }).from(place).where(inArray(place.id, ids))

    await t.test('strong evidence beyond the former 60-card quality window is not lost', async () => {
      const page = await listExperienceCandidates(experience, 12, 0)
      assert.equal(page.candidates[0]?.card.id, ids[72])
      assert.ok(page.total >= 73)
    })
    await t.test('all pages are disjoint, exhaustive and repeatable', async () => {
      const first = await listExperienceCandidates(experience, 12, 0)
      const all: number[] = []
      for (let offset = 0; offset < first.total; offset += 12) {
        const page = await listExperienceCandidates(experience, 12, offset)
        assert.ok(page.candidates.length <= 12)
        all.push(...page.candidates.map(candidate => candidate.card.id))
      }
      assert.equal(new Set(all).size, all.length)
      assert.deepEqual(new Set(all.filter(id => ids.includes(id))), new Set(ids.slice(0, 73)))
      const again = await listExperienceCandidates(experience, 12, 0)
      assert.deepEqual(again.candidates.map(candidate => candidate.card.id), first.candidates.map(candidate => candidate.card.id))
    })
    await t.test('empty and scoped ID filters do not widen visibility', async () => {
      assert.deepEqual(await listPlaceCards({ placeIds: [] }), [])
      assert.equal(await countPlaces({ placeIds: [] }), 0)
      const scoped = await listPlaceCards({ placeIds: [ids[0]!, ids[74]!] })
      assert.deepEqual(scoped.map(card => card.id), [ids[0]])
      assert.equal(scoped[0]?.priceMedian, 0)
    })
    await t.test('stable SQL pages keep equal-score records exactly once', async () => {
      const all = await listPlaceCards({ placeIds: ids, sort: 'quality', limit: 100 })
      const chunks = await Promise.all([0, 12, 24, 36, 48, 60, 72].map(offset =>
        listPlaceCards({ placeIds: ids, sort: 'quality', limit: 12, offset })))
      assert.deepEqual(chunks.flat().map(card => card.id), all.map(card => card.id))
    })
    await t.test('nonpublic and explicitly negative candidates stay excluded', async () => {
      const all = await listExperienceCandidates(experience, 200)
      assert.equal(all.candidates.some(candidate => candidate.card.id === ids[73] || candidate.card.id === ids[74]), false)
    })
    await t.test('read-only pagination preserves price and sensitive timestamps', async () => {
      const after = await db.select({ id: place.id, price: place.priceMedian, verified: place.lastVerifiedAt,
        sync: place.lastSourceSyncAt, updated: place.updatedAt }).from(place).where(inArray(place.id, ids))
      assert.deepEqual(after, before)
      const [unknown] = await db.select({ price: place.priceMedian }).from(place).where(eq(place.id, ids[1]!))
      assert.equal(unknown?.price, null)
    })
  } finally {
    if (ids.length) await db.delete(place).where(inArray(place.id, ids))
    await closeDb()
  }
})
