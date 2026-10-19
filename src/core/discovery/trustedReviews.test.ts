import assert from 'node:assert/strict'
import test from 'node:test'
import { publicReviewDate, publicReviewExcerpt, rankTrustedReviews } from './trustedReviews'

const now = new Date('2026-10-17T10:00:00Z')
function card(id: number, patch: Record<string, unknown> = {}) {
  return {
    reviewId: id,
    placeId: id,
    placeName: `کافه ${id}`,
    placeSlug: `cafe-${id}`,
    placeStatus: 'published' as const,
    placeImage: null,
    districtName: `محله ${id}`,
    rating: 5,
    approvedReviewCount: 1,
    excerpt: 'تجربه واقعی',
    reviewedAt: now,
    isBloggerReview: false,
    qualityScore: 70,
    ratingSum: 5,
    ...patch,
  }
}

test('trusted review excerpts redact contact-like content and bound length', () => {
  assert.equal(publicReviewExcerpt('خوب بود test@example.com 09123456789 @private https://example.com/x'), 'خوب بود … … … …')
  assert.equal(publicReviewExcerpt('شماره ۰۹۱۲۳۴۵۶۷۸۹'), 'شماره …')
  assert.equal(Array.from(publicReviewExcerpt('آ'.repeat(180))).length, 151)
})

test('public review dates retain valid dates and omit invalid or absent dates', () => {
  const valid = new Date('2026-10-18T10:00:00Z')
  assert.equal(publicReviewDate(valid), valid)
  assert.equal(publicReviewDate(new Date('0000-00-00')), null)
  assert.equal(publicReviewDate(new Date(Number.NaN)), null)
  assert.equal(publicReviewDate(null), null)
  assert.equal(publicReviewDate(undefined), null)
  assert.equal(publicReviewDate('2026-10-18'), null)
})

test('review discovery requires three venues and chooses one real review per venue', () => {
  assert.deepEqual(rankTrustedReviews([card(1), card(2)], 3, now), [])
  const result = rankTrustedReviews([
    card(1, { reviewId: 10, reviewedAt: new Date('2026-10-15T10:00:00Z') }),
    card(1, { reviewId: 11, reviewedAt: now, excerpt: 'جدیدتر' }),
    card(2), card(3),
  ], 3, now)
  assert.equal(result.length, 3)
  assert.equal(result.find(item => item.placeId === 1)?.excerpt, 'جدیدتر')
})

test('Bayesian ranking and district diversity do not label a single five-star review best', () => {
  const result = rankTrustedReviews([
    card(1, { districtName: 'الف', approvedReviewCount: 1, ratingSum: 5 }),
    card(2, { districtName: 'الف', approvedReviewCount: 12, ratingSum: 54 }),
    card(3, { districtName: 'ب', approvedReviewCount: 4, ratingSum: 18 }),
    card(4, { districtName: 'ج', approvedReviewCount: 5, ratingSum: 21 }),
  ], 3, now)
  assert.equal(result[0]?.placeId, 2)
  assert.equal(new Set(result.map(item => item.districtName)).size, 3)
  assert.equal(result.some(item => item.placeId === 1), false)
})

test('temporarily closed public venues remain labeled and rank below equivalent open venues', () => {
  const result = rankTrustedReviews([
    card(1, { placeStatus: 'temporarily_closed', districtName: 'الف' }),
    card(2, { districtName: 'ب' }),
    card(3, { districtName: 'ج' }),
  ], 3, now)
  assert.equal(result[0]?.placeStatus, 'published')
  assert.equal(result.at(-1)?.placeStatus, 'temporarily_closed')
})
