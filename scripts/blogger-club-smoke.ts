import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection.ts'
import {
  appUser,
  bloggerProfile,
  clubMembership,
  clubOffer,
  review,
  place,
} from '../src/db/schema.ts'
import {
  createOffer,
  issueCode,
  listClubMembers,
  listMyClub,
  redeemCode,
  setMembership,
} from '../src/core/club/service.ts'
import { listPlaceCards, listPlaceReviews } from '../src/core/places/queries.ts'
import { recalcPlaceRating, submitReview } from '../src/core/user/userData.ts'

const db = getDb()
const userId = randomUUID()
const suffix = randomBytes(5).toString('hex')
let placeId: number | null = null

try {
  const [target] = await db
    .select({ id: place.id, slug: place.slug })
    .from(place)
    .where(eq(place.status, 'published'))
    .limit(1)
  assert.ok(target, 'هیچ کافه منتشرشده‌ای برای تست نیست')
  placeId = target.id

  await db.insert(appUser).values({
    id: userId,
    username: `qa_${suffix}`,
    name: 'کاربر آزمون بلاگر',
    role: 'customer',
  })
  await db.insert(bloggerProfile).values({ userId, active: true, instagramHandle: 'kucafe_qa' })

  const reviewResult = await submitReview({
    placeId,
    userId,
    authorName: 'کاربر آزمون بلاگر',
    stars: 5,
    text: 'بررسی موقت خودکار',
    isBlogger: true,
    videoUrl: 'https://www.instagram.com/reel/KUCAFE_QA/',
  }, { requireApproval: false, minTextLength: 0, maxTextLength: 4000, blocklist: [] })
  assert.deepEqual(reviewResult, { ok: true, status: 'approved' })

  const reviews = await listPlaceReviews(placeId, 100)
  assert.ok(reviews.some((item) => item.isBloggerReview && item.videoUrl?.includes('KUCAFE_QA')))
  const reviewedCards = await listPlaceCards({ bloggerReviewedOnly: true, limit: 400 })
  assert.ok(reviewedCards.some((item) => item.id === placeId && Number(item.bloggerReviewCount) > 0))

  await setMembership(userId, placeId, true)
  assert.ok((await listClubMembers(placeId)).some((member) => member.userId === userId))
  await createOffer({
    placeId,
    title: 'تخفیف آزمون',
    discountLabel: '۱۰٪',
    createdBy: userId,
  })
  const [offer] = await db
    .select({ id: clubOffer.id })
    .from(clubOffer)
    .where(and(eq(clubOffer.placeId, placeId), eq(clubOffer.createdByUserId, userId)))
    .orderBy(desc(clubOffer.id))
    .limit(1)
  assert.ok(offer)

  const firstCode = await issueCode({ placeId, offerId: offer.id, userId })
  const repeatedCode = await issueCode({ placeId, offerId: offer.id, userId })
  assert.equal(firstCode, repeatedCode, 'باید همان کد فعال بازگردد')
  assert.match(firstCode, /^KU-[A-F0-9]{12}$/)
  assert.equal(await redeemCode({ placeId, code: firstCode, actorId: userId }), true)
  assert.equal(await redeemCode({ placeId, code: firstCode, actorId: userId }), false)
  assert.ok((await listMyClub(userId)).some((item) => item.code === firstCode && item.status === 'redeemed'))

  console.log('✓ دسترسی بلاگر، نظر و لینک ویدئو')
  console.log('✓ فیلتر کافه‌های بررسی‌شده')
  console.log('✓ عضویت صریح، صدور کد یکتا و مصرف یک‌باره')
} finally {
  if (placeId) {
    await db.delete(review).where(eq(review.userId, userId))
    await db.delete(clubOffer).where(eq(clubOffer.createdByUserId, userId))
    await db.delete(clubMembership).where(eq(clubMembership.userId, userId))
    await recalcPlaceRating(placeId)
  }
  await db.delete(bloggerProfile).where(eq(bloggerProfile.userId, userId))
  await db.delete(appUser).where(eq(appUser.id, userId))
  await closeDb()
}
