import 'server-only'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/mysql-core'
import { getDb } from '@/db/client'
import { district, media, place, review } from '@/db/schema'
import { mediaPublicUrl } from '@/core/media/store'
import { PUBLIC_PLACE_STATUSES } from '@/core/places/queries'
import { bayesianAverage, rawAverage } from '@/core/rating/bayesian'

/** Only public, approved review content; author/contact identifiers never leave this query. */
export interface TrustedReviewCard {
  reviewId: number
  placeId: number
  placeName: string
  placeSlug: string
  placeStatus: 'published' | 'temporarily_closed'
  placeImage: string | null
  districtName: string | null
  rating: number | null
  approvedReviewCount: number
  excerpt: string
  reviewedAt: Date
  isBloggerReview: boolean
}

type Candidate = TrustedReviewCard & { qualityScore: number; ratingSum: number }

/** Defense-in-depth: an approved free-text review might still contain a contact. */
export function publicReviewExcerpt(value: string, maxChars = 150): string {
  const safe = value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '…')
    .replace(/(?:\+?[\p{Nd}][\p{Nd}\s()\-]{7,}[\p{Nd}])/gu, '…')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '…')
    .replace(/@[\p{L}\p{N}_.]+/gu, '…')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = Array.from(safe)
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('').trimEnd()}…` : safe
}

/** The latest review represents each venue; coverage, shrinkage and freshness
 * affect order, while district diversity avoids a homogeneous rail. */
export function rankTrustedReviews(candidates: Candidate[], limit = 3, now = new Date()): TrustedReviewCard[] {
  const byPlace = new Map<number, Candidate>()
  for (const candidate of candidates) {
    if (!candidate.excerpt || !Number.isSafeInteger(candidate.reviewId)) continue
    const existing = byPlace.get(candidate.placeId)
    if (!existing || candidate.reviewedAt > existing.reviewedAt) byPlace.set(candidate.placeId, candidate)
  }
  if (byPlace.size < 3) return []
  const scored = [...byPlace.values()].map(card => {
    const count = Math.max(0, card.approvedReviewCount)
    const ageDays = Math.max(0, (now.getTime() - card.reviewedAt.getTime()) / 86_400_000)
    return {
      card,
      score: bayesianAverage(card.ratingSum, count) * 8
        + Math.log1p(count) * 2
        + Math.max(0, 2 - ageDays / 90)
        + Math.min(100, Math.max(0, card.qualityScore)) / 50
        - (card.placeStatus === 'temporarily_closed' ? 3 : 0),
    }
  }).sort((a, b) => b.score - a.score || b.card.reviewId - a.card.reviewId)
  const chosen: TrustedReviewCard[] = []
  const usedDistricts = new Set<string>()
  for (const { card } of scored) {
    if (card.districtName && usedDistricts.has(card.districtName)) continue
    chosen.push(card)
    if (card.districtName) usedDistricts.add(card.districtName)
    if (chosen.length >= limit) return chosen
  }
  for (const { card } of scored) {
    if (chosen.some(item => item.placeId === card.placeId)) continue
    chosen.push(card)
    if (chosen.length >= limit) break
  }
  return chosen
}

export async function listTrustedReviewCards(limit = 3): Promise<TrustedReviewCard[]> {
  const cover = alias(media, 'trusted_review_cover')
  const logo = alias(media, 'trusted_review_logo')
  const rows = await getDb().select({
    reviewId: review.id,
    text: review.text,
    reviewedAt: review.createdAt,
    isBloggerReview: review.isBloggerReview,
    placeId: place.id,
    placeName: place.name,
    placeSlug: place.slug,
    placeStatus: place.status,
    districtName: district.name,
    coverPath: cover.localPath,
    logoPath: logo.localPath,
    ratingSum: place.ratingSum,
    ratingCount: place.ratingCount,
    qualityScore: place.qualityScore,
  })
    .from(review)
    .innerJoin(place, eq(review.placeId, place.id))
    .leftJoin(district, eq(place.districtId, district.id))
    .leftJoin(cover, and(eq(place.coverMediaId, cover.id), eq(cover.status, 'ok')))
    .leftJoin(logo, and(eq(place.logoMediaId, logo.id), eq(logo.status, 'ok')))
    .where(and(
      eq(review.status, 'approved'),
      inArray(place.status, [...PUBLIC_PLACE_STATUSES]),
      sql`CHAR_LENGTH(TRIM(${review.text})) > 0`,
      sql`NOT EXISTS (
        SELECT 1 FROM review newer
        WHERE newer.place_id = ${review.placeId} AND newer.status = 'approved'
          AND CHAR_LENGTH(TRIM(newer.text)) > 0
          AND (newer.created_at > ${review.createdAt}
            OR (newer.created_at = ${review.createdAt} AND newer.id > ${review.id}))
      )`,
    ))
    .orderBy(desc(review.createdAt), desc(review.id))
    .limit(96)

  const candidates: Candidate[] = rows.flatMap(row => {
    const excerpt = publicReviewExcerpt(row.text ?? '')
    if (!excerpt || excerpt === '…') return []
    const rating = row.ratingCount > 0 ? rawAverage(row.ratingSum, row.ratingCount) : null
    return [{
      reviewId: row.reviewId,
      placeId: row.placeId,
      placeName: row.placeName,
      placeSlug: row.placeSlug,
      placeStatus: row.placeStatus as 'published' | 'temporarily_closed',
      placeImage: mediaPublicUrl(row.coverPath ?? row.logoPath),
      districtName: row.districtName,
      rating: rating !== null && rating >= 1 && rating <= 5 ? rating : null,
      approvedReviewCount: Math.max(0, row.ratingCount),
      excerpt,
      reviewedAt: row.reviewedAt,
      isBloggerReview: row.isBloggerReview,
      qualityScore: row.qualityScore,
      ratingSum: row.ratingSum,
    }]
  })
  return rankTrustedReviews(candidates, Math.min(6, Math.max(1, limit)))
}
