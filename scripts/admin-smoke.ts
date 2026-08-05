/**
 * دود-تست قابلیت‌های پنل ادمین.
 *
 * اکشن‌های Next (که به کوکی نیاز دارند) اینجا اجرا نمی‌شوند؛ آنچه تست می‌شود
 * **اثر واقعیِ همان کارها روی دیتابیس** است: صدور اعتبارنامه که با آن بشود
 * وارد شد، انتساب کافه که پنل را باز کند، تأیید نظر که امتیاز را عوض کند، و
 * تأیید کافه‌ی ثبت‌شده که مکان بسازد.
 */

import { desc, eq, like, or } from 'drizzle-orm'
import { generatePassword, hashPassword, verifyPassword } from '../src/core/auth/password'
import {
  canManagePlace,
  createUser,
  findUserByLogin,
  findUserById,
  grantPlaceRole,
  setCredentials,
  setUserBlocked,
  setUserRole,
} from '../src/core/auth/userRepo'
import {
  getDataHealth,
  getModerationQueue,
  getTrafficSummary,
  getUserSummary,
  listPendingReviews,
} from '../src/core/analytics/stats'
import { detectDevice } from '../src/core/analytics/track'
import { recalcPlaceRating, submitPlace, submitReview } from '../src/core/user/userData'
import { closeDb, getDb } from '../src/db/connection'
import {
  appUser,
  place as placeTable,
  placeSubmission,
  review as reviewTable,
  userPlaceRole,
} from '../src/db/schema'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const CAFE_USERNAME = '__smoke_venue__'

async function cleanup() {
  const db = getDb()
  const users = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(or(like(appUser.username, '__smoke%'), like(appUser.name, '__smoke%')))
  for (const user of users) {
    await db.delete(reviewTable).where(eq(reviewTable.userId, user.id))
    await db.delete(placeSubmission).where(eq(placeSubmission.userId, user.id))
    await db.delete(userPlaceRole).where(eq(userPlaceRole.userId, user.id))
    await db.delete(appUser).where(eq(appUser.id, user.id))
  }
  await db.delete(placeTable).where(like(placeTable.slug, '__smoke%'))
  await db.delete(placeTable).where(like(placeTable.name, '__smoke%'))
}

async function main() {
  const db = getDb()
  await cleanup()

  // ═══ تشخیص دستگاه (پایه‌ی آمار سالم) ═══
  check('موبایل تشخیص داده می‌شود', detectDevice('Mozilla/5.0 (iPhone) Mobile/15E148') === 'mobile')
  check('دسکتاپ تشخیص داده می‌شود', detectDevice('Mozilla/5.0 (Windows NT 10.0; Win64)') === 'desktop')
  check(
    'ربات جدا شمرده می‌شود',
    detectDevice('Mozilla/5.0 (compatible; Googlebot/2.1)') === 'bot',
    'قاطی‌شدنش با آدم‌ها آمار را بی‌معنی می‌کند',
  )
  check('بدون UA → نامشخص', detectDevice(null) === 'unknown')

  // ═══ صدور اعتبارنامه برای پنل کافه ═══
  const [somePlace] = await db
    .select({ id: placeTable.id, name: placeTable.name })
    .from(placeTable)
    .where(eq(placeTable.status, 'published'))
    .limit(1)
  if (!somePlace) throw new Error('هیچ مکان منتشرشده‌ای نیست — اول ایمپورت را اجرا کنید')

  const password = generatePassword(14)
  const venueUser = await createUser({
    username: CAFE_USERNAME,
    name: '__smoke_venue_manager',
    role: 'owner',
    passwordHash: hashPassword(password),
    mustChangePassword: true,
  })
  check('حساب کافه بدون شماره ساخته می‌شود', !!venueUser.id, 'ادمین شماره‌ی جعلی نمی‌سازد')

  const loginTest = await findUserByLogin(CAFE_USERNAME)
  check('با یوزرنیم پیدا می‌شود', loginTest?.id === venueUser.id)
  check('رمز صادرشده کار می‌کند', verifyPassword(password, loginTest!.passwordHash))
  check('رمز موقت علامت خورده', loginTest?.mustChangePassword === true, 'کانال ارسال رمز امن نیست')

  await grantPlaceRole(venueUser.id, somePlace.id, { role: 'owner' })
  check('انتساب کافه انجام شد', await canManagePlace(venueUser.id, somePlace.id))
  const withPlace = await findUserById(venueUser.id)
  check(
    'کافه در پنل کاربر دیده می‌شود',
    withPlace?.ownedPlaces.some((place) => place.id === somePlace.id) === true,
    somePlace.name,
  )

  // بازنشانی رمز
  const secondPassword = generatePassword(14)
  await setCredentials(venueUser.id, { passwordHash: hashPassword(secondPassword) })
  const reset = await findUserById(venueUser.id)
  check('بازنشانی رمز کار می‌کند', verifyPassword(secondPassword, reset!.passwordHash))
  check('رمز قبلی باطل شد', !verifyPassword(password, reset!.passwordHash))

  // ═══ اعتبارنامه برای کاربر عادی ═══
  const normalUser = await createUser({
    phone: '09990007788',
    name: '__smoke_normal',
    role: 'customer',
  })
  check('کاربر عادی بدون رمز ساخته می‌شود', normalUser.passwordHash === null)
  const userPassword = generatePassword(12)
  await setCredentials(normalUser.id, { passwordHash: hashPassword(userPassword) })
  const withPassword = await findUserById(normalUser.id)
  check(
    'کاربر عادی رمز دائمی می‌گیرد',
    verifyPassword(userPassword, withPassword!.passwordHash),
    'تا وقتی پیامک نیست، این تنها راه ورودش است',
  )

  // ═══ نقش و مسدودی ═══
  await setUserRole(normalUser.id, 'owner')
  check('تغییر نقش', (await findUserById(normalUser.id))?.role === 'owner')
  await setUserBlocked(normalUser.id, true)
  check('مسدودسازی', (await findUserById(normalUser.id))?.blocked === true)
  await setUserBlocked(normalUser.id, false)

  // ═══ تأیید نظر → امتیاز مکان ═══
  const beforeRating = (
    await db
      .select({ sum: placeTable.ratingSum, count: placeTable.ratingCount })
      .from(placeTable)
      .where(eq(placeTable.id, somePlace.id))
  )[0]!

  const reviewResult = await submitReview({
    placeId: somePlace.id,
    userId: normalUser.id,
    authorName: '__smoke_normal',
    stars: 5,
    text: 'تست',
  })
  check('ثبت نظر', reviewResult.ok)
  check('نظر در وضعیت انتظار می‌ماند', reviewResult.ok && reviewResult.status === 'pending')

  const queueBefore = await getModerationQueue()
  check('نظر در صف تأیید دیده می‌شود', queueBefore.pendingReviews > 0, `${queueBefore.pendingReviews} مورد`)

  const pending = await listPendingReviews(50)
  check('صف تأیید نظر را برمی‌گرداند', pending.some((row) => row.placeId === somePlace.id))

  const midRating = (
    await db
      .select({ count: placeTable.ratingCount })
      .from(placeTable)
      .where(eq(placeTable.id, somePlace.id))
  )[0]!
  check(
    'نظر تأییدنشده امتیاز را عوض نمی‌کند',
    midRating.count === beforeRating.count,
    'وگرنه هر نظر توهین‌آمیزی بلافاصله اثر می‌گذاشت',
  )

  // تأیید
  const [reviewRow] = await db
    .select({ id: reviewTable.id })
    .from(reviewTable)
    .where(eq(reviewTable.userId, normalUser.id))
    .limit(1)
  await db.update(reviewTable).set({ status: 'approved' }).where(eq(reviewTable.id, reviewRow!.id))
  await recalcPlaceRating(somePlace.id)

  const afterRating = (
    await db
      .select({ sum: placeTable.ratingSum, count: placeTable.ratingCount })
      .from(placeTable)
      .where(eq(placeTable.id, somePlace.id))
  )[0]!
  check(
    'تأیید نظر امتیاز را بازمحاسبه می‌کند',
    afterRating.count === beforeRating.count + 1 && afterRating.sum === beforeRating.sum + 5,
    `${beforeRating.count} → ${afterRating.count}`,
  )

  // رد کردن، امتیاز را برمی‌گرداند
  await db.update(reviewTable).set({ status: 'rejected' }).where(eq(reviewTable.id, reviewRow!.id))
  await recalcPlaceRating(somePlace.id)
  const revertedRating = (
    await db
      .select({ count: placeTable.ratingCount })
      .from(placeTable)
      .where(eq(placeTable.id, somePlace.id))
  )[0]!
  check(
    'رد نظر امتیاز را پس می‌گیرد',
    revertedRating.count === beforeRating.count,
    'رول‌آپ همیشه با نظرهای تأییدشده می‌خواند',
  )

  // ═══ کافه‌ی ثبت‌شده توسط کاربر ═══
  const submitResult = await submitPlace({
    userId: normalUser.id,
    name: '__smoke_new_cafe',
    address: 'مشهد، سجاد',
    lat: 36.3157,
    lng: 59.5391,
  })
  check('ثبت کافه توسط کاربر', submitResult.ok)

  const [submission] = await db
    .select({ id: placeSubmission.id, status: placeSubmission.status })
    .from(placeSubmission)
    .where(eq(placeSubmission.userId, normalUser.id))
    .orderBy(desc(placeSubmission.id))
    .limit(1)
  check('در صف بررسی نشست', submission?.status === 'pending')

  // تشخیص تکراری
  const dupResult = await submitPlace({ userId: normalUser.id, name: somePlace.name })
  check('تکراری تشخیص داده می‌شود', dupResult.ok)
  const [dupRow] = await db
    .select({ status: placeSubmission.status, note: placeSubmission.note })
    .from(placeSubmission)
    .where(eq(placeSubmission.userId, normalUser.id))
    .orderBy(desc(placeSubmission.id))
    .limit(1)
  check(
    'تکراری رد نمی‌شود، علامت می‌خورد',
    dupRow?.status === 'duplicate' && !!dupRow.note,
    dupRow?.note ?? '',
  )

  // ═══ گزارش‌ها ═══
  const health = await getDataHealth()
  check('سلامت داده محاسبه می‌شود', health.total > 300, `${health.total} مکان · ${health.noCoords} بی‌مختصات`)
  check('فروشگاه‌ها شمرده می‌شوند', health.shops > 0, `${health.shops} مورد`)

  const traffic = await getTrafficSummary()
  check('آمار بازدید محاسبه می‌شود', traffic.viewsMonth >= 0, `${traffic.viewsMonth} بازدید ۳۰ روز`)

  const userStats = await getUserSummary()
  check('آمار کاربران محاسبه می‌شود', userStats.total >= 2, `${userStats.total} کاربر`)
  check('شمارش «دارای رمز» کار می‌کند', userStats.withPassword >= 1)

  await cleanup()
  await recalcPlaceRating(somePlace.id)
  const finalRating = (
    await db
      .select({ count: placeTable.ratingCount })
      .from(placeTable)
      .where(eq(placeTable.id, somePlace.id))
  )[0]!
  check('پاک‌سازی و بازگرداندن امتیاز', finalRating.count === beforeRating.count)

  await closeDb()
  console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await cleanup().catch(() => {})
  await closeDb()
  process.exit(1)
})
