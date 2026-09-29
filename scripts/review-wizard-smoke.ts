import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import { chromium, type Page, type Route } from 'playwright'
import { getDb, closeDb } from '../src/db/connection'
import { appUser, place, menuItem, menuSection, review, reviewItem } from '../src/db/schema'
import { createAuthSession, revokeSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { getMyReviewFor } from '../src/core/user/userData'
import { listPlaceReviews, listMyPlaceReviews } from '../src/core/places/queries'

// All writes are isolated to UUID-labelled temporary accounts/places and removed.
// No existing account, moderation setting, real cafe, scrape or price is changed.
const base = process.argv[2] ?? 'http://127.0.0.1:9096'
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || ['https://kucafe.ir', 'https://dev.kucafe.ir'].includes(base), 'Use an explicitly supported QA endpoint')
const db = getDb(), userId = randomUUID(), otherId = randomUUID(), slug = `review-wizard-qa-${userId.slice(0, 8)}`
let placeId: number | undefined, sid: string | undefined, otherSid: string | undefined
let activePage: Page | undefined
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--enable-unsafe-swiftshader'] })
const errors: string[] = [], text = 'نظر موقت آزمون خودکار؛ این داده بلافاصله پس از بررسی حذف می‌شود.'
const screenshotDir = `var/qa/review-confirmation-${new URL(base).hostname}`
try {
  await db.insert(appUser).values([
    { id: userId, username: slug, name: 'آزمون موقت نظردهی', role: 'customer' },
    { id: otherId, username: `${slug}-other`, name: 'آزمون موقت حریم خصوصی', role: 'customer' },
  ])
  const [target] = await db.insert(place).values({ slug, name: 'کافه موقت آزمون نظردهی', nameNormalized: 'کافه موقت آزمون نظردهی', status: 'published', source: 'owner' }).$returningId()
  placeId = target.id
  const [section] = await db.insert(menuSection).values({ placeId, name: 'غذا' }).$returningId()
  const [food] = await db.insert(menuItem).values({ placeId, sectionId: section.id, publicId: slug, name: 'پاستا آزمون', nameNormalized: 'پاستا آزمون', price: 100000 }).$returningId()
  sid = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 900000), userAgent: 'review-wizard-qa' })
  otherSid = await createAuthSession({ userId: otherId, method: 'password', expiresAt: new Date(Date.now() + 900000), userAgent: 'review-privacy-qa' })
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken({ sessionId: sid, userId, phone: '', role: 'customer' }, 900), url: base, httpOnly: true }])
  const page = await context.newPage()
  activePage = page
  page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(20000)
  const initial = await page.goto(`${base}/cafe/${slug}`, { waitUntil: 'domcontentloaded' })
  assert.equal(initial?.status(), 200)
  assert.match(initial!.headers()['cache-control'], /no-store/, 'Personal review HTML must not be shared/cached')
  await page.getByRole('button', { name: 'ثبت تجربهٔ من', exact: true }).click()
  const popup = page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' })
  const stars = (value: number) => popup.locator(`label:has(input[name="stars"][value="${value}"])`)
  await stars(5).click()
  await popup.getByRole('button', { name: 'انتخاب سفارش‌ها', exact: true }).click()
  await popup.getByRole('textbox', { name: 'جست‌وجوی آیتم سفارش‌داده‌شده' }).fill('پاستا')
  await popup.locator('input[type="checkbox"]').check()
  await popup.getByRole('button', { name: 'ادامه', exact: true }).click()
  await popup.getByRole('button', { name: 'دیروز', exact: true }).click()
  await popup.locator('textarea[name="text"]').fill(text)
  await popup.getByText('جزئیات بیشتر؛ امتیاز جداگانه', { exact: true }).click()
  await popup.locator('label:has(input[name="ratingFood"][value="4"])').click()
  await popup.locator('input[name="placeId"]').evaluate(element => { (element as HTMLInputElement).value = '-1' })
  await popup.getByRole('button', { name: 'ثبت تجربه', exact: true }).click()
  await popup.getByRole('alert').filter({ hasText: 'این مجموعه پیدا نشد.' }).waitFor()
  assert.ok(await popup.isVisible(), 'A failed submission must keep the form open')
  assert.equal(await popup.locator('textarea[name="text"]').inputValue(), text, 'Failure must preserve the draft')
  assert.equal(await popup.locator('input[name="stars"]:checked').getAttribute('value'), '5', 'Failure must preserve the submitted radio rating')
  assert.equal(await popup.locator('input[name="ratingFood"]:checked').getAttribute('value'), '4')
  assert.ok(await popup.locator('input[type="checkbox"]').isChecked())
  assert.equal((await db.select({ id: review.id }).from(review).where(eq(review.userId, userId))).length, 0)
  await popup.locator('input[name="placeId"]').evaluate((element, id) => { (element as HTMLInputElement).value = String(id) }, placeId)
  const failAction = async (route: Route) => {
    if (route.request().method() === 'POST' && route.request().headers()['next-action']) await route.abort('failed')
    else await route.continue()
  }
  await page.route(`${base}/cafe/${slug}`, failAction)
  await popup.getByRole('button', { name: 'ثبت تجربه', exact: true }).click()
  await popup.getByRole('alert').filter({ hasText: 'نتیجهٔ ثبت نظر دریافت نشد.' }).waitFor()
  assert.equal(await popup.locator('input[name="stars"]:checked').getAttribute('value'), '5')
  assert.equal(await popup.locator('textarea[name="text"]').inputValue(), text)
  assert.equal((await db.select({ id: review.id }).from(review).where(eq(review.userId, userId))).length, 0, 'A lost request must not auto-retry')
  await page.unroute(`${base}/cafe/${slug}`, failAction)
  await popup.getByRole('button', { name: 'ثبت تجربه', exact: true }).click({ clickCount: 2 })
  await popup.getByRole('heading', { name: 'تجربه‌ات ثبت شد', exact: true }).waitFor()
  assert.equal(await popup.getByRole('button', { name: 'ثبت یک مراجعهٔ دیگر', exact: true }).count(), 0)
  const confirm = popup.getByRole('button', { name: 'تأیید و بستن', exact: true })
  await confirm.waitFor()
  assert.ok(await confirm.evaluate(element => document.activeElement === element), 'Focus must move to the confirmation, not disappear with the submitted form')
  await mkdir(screenshotDir, { recursive: true, mode: 0o700 })
  await popup.screenshot({ path: `${screenshotDir}/success-390.png` })
  const mine = await getMyReviewFor(userId, placeId)
  assert.ok(mine); assert.equal(mine.stars, 5); assert.equal(mine.ratingFood, 4); assert.deepEqual(mine.itemIds, [food.id]); assert.ok(mine.visitDate)
  assert.equal((await db.select({ id: review.id }).from(review).where(and(eq(review.userId, userId), eq(review.placeId, placeId)))).length, 1)
  assert.equal((await db.select().from(reviewItem).where(eq(reviewItem.reviewId, mine.id))).length, 1)
  await confirm.click(); await popup.waitFor({ state: 'hidden' })
  await page.locator('[data-own-review]').filter({ hasText: text }).waitFor()
  assert.equal(await page.locator('[data-own-review]').filter({ hasText: text }).count(), 1, 'Own review must be visible once without a manual reload')
  await page.waitForFunction(() => {
    const box = document.querySelector('[data-own-review]')?.getBoundingClientRect()
    return box && box.top >= 0 && box.top < innerHeight - 100
  }, undefined, { timeout: 5000 })
  assert.notEqual(await page.evaluate(() => document.body.style.overflow), 'hidden', 'Confirmation must release scroll lock')
  assert.equal(await page.evaluate(() => Boolean(history.state?.kucafeDialog)), false, 'Successful close must remove the dialog history entry')
  await page.getByText('ویرایش آخرین نظر شما', { exact: true }).click()
  await page.getByRole('button', { name: 'ویرایش تجربه', exact: true }).click()
  const editor = page.getByRole('dialog', { name: 'ویرایش تجربهٔ شما' })
  assert.equal(await editor.locator('input[name="ratingFood"]:checked').getAttribute('value'), '4')
  assert.equal(await editor.locator('input[name="menuItemId"]').getAttribute('value'), String(food.id))
  await editor.getByRole('button', { name: /تاریخ و جزئیات/ }).click()
  const editedText = `${text} ویرایش موفق.`
  await editor.locator('textarea[name="text"]').fill(editedText)
  await editor.getByRole('button', { name: 'ذخیرهٔ ویرایش', exact: true }).click()
  await editor.getByRole('button', { name: 'تأیید و بستن', exact: true }).click()
  await editor.waitFor({ state: 'hidden' })
  await page.locator('[data-own-review]').filter({ hasText: editedText }).waitFor()
  assert.equal((await db.select({ id: review.id }).from(review).where(eq(review.userId, userId))).length, 1, 'Editing must not create a second review')

  // A subsequent visit is still available via the normal launcher, not the success UI.
  await page.getByRole('button', { name: 'ثبت تجربهٔ من', exact: true }).click()
  assert.ok(await popup.getByRole('button', { name: 'انتخاب سفارش‌ها', exact: true }).isDisabled(), 'A successful form must reset after close')
  await stars(4).click()
  await page.keyboard.press('Escape'); await popup.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'ثبت تجربهٔ من', exact: true }).click()
  assert.equal(await popup.locator('input[name="stars"]:checked').getAttribute('value'), '4', 'Dismissing an unfinished form must preserve the draft')
  await popup.getByRole('button', { name: 'انتخاب سفارش‌ها', exact: true }).click()
  await popup.getByRole('button', { name: 'ادامه', exact: true }).click()
  const nextText = 'تجربهٔ دوم موقت و مستقل برای آزمون مراجعهٔ تازه.'
  await popup.locator('textarea[name="text"]').fill(nextText)
  await popup.getByRole('button', { name: 'ثبت تجربه', exact: true }).click()
  await popup.getByRole('button', { name: 'تأیید و بستن', exact: true }).waitFor()
  // Closing a successful modal with Back must also reset/release it.
  await page.goBack(); await popup.waitFor({ state: 'hidden' })
  await page.locator('[data-own-review]').filter({ hasText: nextText }).waitFor()
  assert.equal(await page.locator('[data-own-review]').count(), 2)
  assert.equal((await db.select({ id: review.id }).from(review).where(eq(review.userId, userId))).length, 2)
  const secondVisit = await getMyReviewFor(userId, placeId)
  assert.ok(secondVisit); assert.notEqual(secondVisit.id, mine.id)
  if (!await page.getByRole('button', { name: 'ویرایش تجربه', exact: true }).isVisible()) await page.getByText('ویرایش آخرین نظر شما', { exact: true }).click()
  await page.getByRole('button', { name: 'ویرایش تجربه', exact: true }).click()
  await editor.waitFor()
  assert.equal(await editor.locator('input[name="reviewId"]').getAttribute('value'), String(secondVisit.id))
  assert.equal(await editor.locator('input[name="stars"]:checked').getAttribute('value'), '4', 'Latest-review editor must refresh its fields when a new visit becomes latest')
  assert.equal(await editor.locator('input[name="menuItemId"]').count(), 0)
  await editor.getByRole('button', { name: /تاریخ و جزئیات/ }).click()
  assert.equal(await editor.locator('textarea[name="text"]').inputValue(), nextText)
  await page.keyboard.press('Escape'); await editor.waitFor({ state: 'hidden' })

  // Explicit unpublished fixtures test privacy regardless of site moderation policy.
  await db.update(review).set({ status: 'pending' }).where(eq(review.id, mine.id))
  await db.update(review).set({ status: 'approved' }).where(eq(review.id, secondVisit.id))
  await db.insert(review).values([
    { placeId, userId, authorName: 'آزمون موقت', stars: 3, text: 'نظر شخصی تأییدنشده آزمون', status: 'rejected' },
    { placeId, userId: otherId, authorName: 'آزمون دیگر', stars: 2, text: 'نظر خصوصی کاربر دیگر آزمون', status: 'pending' },
  ])
  const ownHistory = await listMyPlaceReviews(userId, placeId)
  assert.equal(ownHistory.length, 3); assert.ok(ownHistory.every(row => row.userId === userId))
  assert.deepEqual(await listMyPlaceReviews(userId, -1), [], 'Another cafe must not leak personal reviews')
  assert.ok((await listPlaceReviews(placeId)).every(row => row.status === 'approved'), 'Public query must remain approval-only')
  await page.reload({ waitUntil: 'domcontentloaded' })
  const pendingCard = page.locator('[data-own-review][data-review-status="pending"]').filter({ hasText: editedText })
  await pendingCard.waitFor(); assert.ok(await pendingCard.getByText('نظر شما · در انتظار بررسی؛ فقط برای شما قابل مشاهده است', { exact: true }).isVisible())
  assert.equal(await page.locator('#reviews').getByText(nextText, { exact: true }).count(), 1, 'Approved own review must not duplicate into the public list')
  assert.equal(await page.locator('#reviews').getByText('نظر خصوصی کاربر دیگر آزمون', { exact: true }).count(), 0)
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.locator('#reviews').scrollIntoViewIfNeeded()
    assert.ok(await pendingCard.isVisible())
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Horizontal overflow at ${width}px`)
    await page.locator('#reviews').screenshot({ path: `${screenshotDir}/own-reviews-${width}.png` })
  }
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
  await desktop.addCookies(await context.cookies(base))
  const desktopPage = await desktop.newPage(); desktopPage.on('pageerror', error => errors.push(error.message))
  await desktopPage.goto(`${base}/cafe/${slug}`, { waitUntil: 'domcontentloaded' })
  await desktopPage.locator('[data-own-review][data-review-status="pending"]').filter({ hasText: editedText }).waitFor()
  assert.ok(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Desktop overflow')
  await desktopPage.locator('#reviews').screenshot({ path: `${screenshotDir}/own-reviews-1440.png` })
  const anonymous = await browser.newContext(), second = await browser.newContext()
  await second.addCookies([{ name: SESSION_COOKIE, value: createSessionToken({ sessionId: otherSid, userId: otherId, phone: '', role: 'customer' }, 900), url: base, httpOnly: true }])
  for (const ctx of [anonymous, second]) {
    const visitor = await ctx.newPage(); visitor.on('pageerror', error => errors.push(error.message))
    await visitor.goto(`${base}/cafe/${slug}`, { waitUntil: 'domcontentloaded' })
    assert.equal(await visitor.locator('#reviews').getByText(nextText, { exact: true }).count(), 1, 'Approved review must remain publicly visible')
    assert.equal(await visitor.locator('#reviews').getByText(editedText, { exact: true }).count(), 0)
    assert.equal(await visitor.locator('#reviews').getByText('نظر شخصی تأییدنشده آزمون', { exact: true }).count(), 0)
  }
  // The shared popover change must not regress hours/comparison on a real cafe.
  const publicPage = await anonymous.newPage(); publicPage.on('pageerror', error => errors.push(error.message))
  publicPage.setDefaultTimeout(20000)
  await publicPage.setViewportSize({ width: 390, height: 844 })
  await publicPage.goto(`${base}/cafe/ramouz-cafe`, { waitUntil: 'domcontentloaded' })
  await publicPage.getByRole('button', { name: 'مقایسهٔ قیمت', exact: true }).click()
  const comparison = publicPage.getByRole('dialog', { name: 'قیمت اینجا در مقایسه با شهر' })
  await comparison.getByRole('status').waitFor()
  await comparison.getByText('با دید باز انتخاب کن', { exact: true }).waitFor()
  await publicPage.keyboard.press('Escape'); await comparison.waitFor({ state: 'hidden' })
  await publicPage.waitForFunction(() => document.body.style.overflow !== 'hidden')
  await publicPage.getByRole('button', { name: /ساعت هفته/ }).click()
  const hours = publicPage.getByRole('dialog', { name: /ساعت/ })
  await hours.waitFor(); await publicPage.goBack(); await hours.waitFor({ state: 'hidden' })
  await publicPage.waitForFunction(() => document.body.style.overflow !== 'hidden')
  assert.deepEqual(errors, [])
  console.log(`✓ ${base}: create/edit/food/date, failed retry preserves all fields, duplicate-submit guard, confirmation closes, own review visible once/in viewport, pending/rejected privacy, multiple visits, draft retention, Back/scroll release, 320/390/1440px, shared price/hours popup regression, no runtime errors`)
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await mkdir(screenshotDir, { recursive: true, mode: 0o700 })
    await activePage.screenshot({ path: `${screenshotDir}/failure.png` }).catch(() => {})
    console.error('Open test dialog:', await activePage.locator('dialog[open]').innerText().catch(() => '(none)'))
    console.error('Runtime errors:', errors)
  }
  throw error
} finally {
  try {
    if (sid) await revokeSession(sid)
    if (otherSid) await revokeSession(otherSid)
    await db.delete(review).where(eq(review.userId, userId))
    await db.delete(review).where(eq(review.userId, otherId))
    if (placeId) await db.delete(place).where(eq(place.id, placeId))
    await db.delete(appUser).where(eq(appUser.id, userId))
    await db.delete(appUser).where(eq(appUser.id, otherId))
  } finally {
    await closeDb()
    await browser.close()
  }
}
