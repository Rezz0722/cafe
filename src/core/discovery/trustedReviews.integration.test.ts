import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { place, review, searchLog } from '@/db/schema'
import { listPublicReviewPage, listTrustedReviewCards } from './trustedReviews'
import { recordHomeDiscoveryEvent } from './recordTracking'
import { parseHomeDiscoveryEvent } from './tracking'

function assertDisposableDatabase() {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_trusted_reviews_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
}

test('approved public reviews only; moderation removes them without leaking contacts', {
  skip: process.env.KUCAFE_TRUSTED_REVIEWS_DB_TEST !== '1',
}, async () => {
  assertDisposableDatabase()
  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const placeIds: number[] = []
  let logId: number | null = null
  try {
    const statuses = ['published', 'published', 'temporarily_closed', 'draft'] as const
    for (const [index, status] of statuses.entries()) {
      const [row] = await db.insert(place).values({
        slug: `qa-trusted-review-${suffix}-${index}`, name: `QA تجربه ${index}`,
        nameNormalized: `QA تجربه ${index}`, status,
        ratingSum: index === 3 ? 5 : 9, ratingCount: index === 3 ? 1 : 2,
        qualityScore: 70,
      })
      placeIds.push(row.insertId)
    }
    const reviewRows = [
      { placeId: placeIds[0]!, stars: 5, text: 'عالی بود 09123456789', status: 'approved' as const, createdAt: new Date('2026-10-16T10:00:00Z') },
      { placeId: placeIds[0]!, stars: 4, text: 'این نظر نباید دیده شود', status: 'pending' as const, createdAt: new Date('2026-10-17T10:00:00Z') },
      { placeId: placeIds[1]!, stars: 4, text: 'فضای آرام و تجربه خوب', status: 'approved' as const, isBloggerReview: true },
      { placeId: placeIds[2]!, stars: 5, text: 'منوی خوب', status: 'approved' as const },
      { placeId: placeIds[3]!, stars: 5, text: 'این کافه عمومی نیست', status: 'approved' as const },
      { placeId: placeIds[2]!, stars: 1, text: 'ردشده', status: 'rejected' as const },
    ]
    await db.insert(review).values(reviewRows)
    const initial = await listTrustedReviewCards(6)
    const own = initial.filter(item => placeIds.includes(item.placeId))
    assert.equal(own.length, 3)
    assert.equal(own.some(item => item.placeId === placeIds[3]), false)
    assert.equal(own.find(item => item.placeId === placeIds[2])?.placeStatus, 'temporarily_closed')
    assert.equal(own.some(item => item.excerpt.includes('09123456789')), false)
    assert.equal(own.some(item => item.excerpt.includes('این نظر نباید')), false)
    assert.equal(own.find(item => item.placeId === placeIds[1])?.isBloggerReview, true)

    await db.update(review).set({ status: 'rejected' }).where(eq(review.placeId, placeIds[1]!))
    const afterModeration = await listTrustedReviewCards(6)
    assert.equal(afterModeration.some(item => item.placeId === placeIds[1]), false)

    const event = parseHomeDiscoveryEvent({ event: 'review_card_opened', source: 'trusted_reviews', context: String(placeIds[0]) })
    assert.ok(event)
    logId = await recordHomeDiscoveryEvent(event, null)
    const [logged] = await db.select().from(searchLog).where(eq(searchLog.id, logId)).limit(1)
    assert.equal(logged?.query, '')
    assert.equal(logged?.clickedPlaceId, placeIds[0])
    assert.equal(logged?.userId, null)
    assert.equal(logged?.sessionId, null)
    assert.equal(logged?.resolvedIntent?.startsWith('home:review_card_opened:trusted_reviews'), true)
  } finally {
    if (logId !== null) await db.delete(searchLog).where(eq(searchLog.id, logId))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await closeDb()
  }
})

test('public review feed is paginated, stable, sanitized, and omits private fields', {
  skip: process.env.KUCAFE_TRUSTED_REVIEWS_DB_TEST !== '1',
}, async () => {
  assertDisposableDatabase()
  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const placeIds: number[] = []
  try {
    const before = await listPublicReviewPage()
    assert.equal(before.pagination.total, 0, 'This suite requires an empty disposable database')
    const statuses = ['published', 'temporarily_closed', 'draft', 'permanently_closed', 'merged'] as const
    for (const [index, status] of statuses.entries()) {
      const [row] = await db.insert(place).values({ slug: `qa-public-review-${suffix}-${index}`, name: `QA نظر ${index}`, nameNormalized: `QA نظر ${index}`, status })
      placeIds.push(row.insertId)
    }
    const sameDate = new Date('2026-10-18T10:00:00Z')
    await db.insert(review).values(Array.from({ length: 25 }, (_, index) => ({
      placeId: placeIds[index === 24 ? 1 : 0]!,
      authorName: 'private-author-name',
      stars: index % 5 + 1,
      text: index === 23 ? null : `نظر ${index} test@example.com ۰۹۱۲۳۴۵۶۷۸۹ @private https://private.example/review`,
      status: 'approved' as const,
      isBloggerReview: index === 24,
      moderatedByUserId: 'private-moderator-id',
      rejectReason: 'private-reason',
      videoUrl: 'https://private.example/video',
      createdAt: sameDate,
    })))
    await db.insert(review).values([
      { placeId: placeIds[0]!, stars: 1, text: 'pending-hidden', status: 'pending' },
      { placeId: placeIds[0]!, stars: 1, text: 'rejected-hidden', status: 'rejected' },
      { placeId: placeIds[0]!, stars: 1, text: 'spam-hidden', status: 'spam' },
      { placeId: placeIds[2]!, stars: 5, text: 'draft-place-hidden', status: 'approved' },
      { placeId: placeIds[3]!, stars: 5, text: 'permanently-closed-place-hidden', status: 'approved' },
      { placeId: placeIds[4]!, stars: 5, text: 'merged-place-hidden', status: 'approved' },
    ])
    const first = await listPublicReviewPage()
    const second = await listPublicReviewPage('2')
    const last = await listPublicReviewPage('999')
    assert.equal(first.pagination.total, 25)
    assert.equal(first.pagination.totalPages, 3)
    assert.equal(first.reviews.length, 12)
    assert.equal(second.reviews.length, 12)
    assert.equal(last.pagination.page, 3)
    assert.equal(last.reviews.length, 1)
    assert.deepEqual((await listPublicReviewPage('invalid')).reviews, first.reviews)
    assert.equal(first.reviews[0]?.isBloggerReview, true)
    assert.equal(first.reviews[0]?.placeStatus, 'temporarily_closed')
    assert.equal(first.reviews[1]?.excerpt, '')
    const all = [...first.reviews, ...second.reviews, ...last.reviews]
    assert.equal(new Set(all.map(item => item.reviewId)).size, 25)
    assert.deepEqual(all.map(item => item.reviewId), all.map(item => item.reviewId).sort((a, b) => b - a), 'equal timestamps use the unique review id as tiebreaker')
    const output = JSON.stringify(all)
    for (const privateValue of ['authorName', 'userId', 'moderatedByUserId', 'rejectReason', 'videoUrl', 'private-author-name', 'private-moderator-id', 'private-reason', 'test@example.com', '۰۹۱۲۳۴۵۶۷۸۹', '@private', 'https://private.example', '-hidden']) {
      assert.equal(output.includes(privateValue), false, privateValue)
    }
    await db.update(review).set({ status: 'rejected' }).where(eq(review.placeId, placeIds[1]!))
    const moderated = await listPublicReviewPage()
    assert.equal(moderated.pagination.total, 24)
    assert.equal(moderated.reviews.some(item => item.placeId === placeIds[1]), false)
  } finally {
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await closeDb()
  }
})
