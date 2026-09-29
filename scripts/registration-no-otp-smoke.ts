/** تست انتهابه‌انتهای ثبت‌نام مستقیم با نام کاربری و رمز. */
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { eq } from 'drizzle-orm'
import { getDb, closeDb } from '@/db/connection'
import { appUser } from '@/db/schema'

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
const username = `qa_nootp_${Date.now().toString(36)}`
const db = getDb()
const browser = await chromium.launch({ headless: true })

try {
  const context = await browser.newContext({
    viewport: { width: 375, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
  })
  const page = await context.newPage()
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  const response = await page.goto(`${base}/auth/register`, { waitUntil: 'networkidle' })
  assert.equal(response?.status(), 200)

  const progress = page.locator('[aria-label^="مرحله "]')
  await progress.waitFor()
  assert.deepEqual(await progress.locator('small').allTextContents(), ['مشخصات', 'رمز عبور'])
  assert.equal(await page.locator('input[type="tel"], input[name="phone"], input[name="code"]').count(), 0)

  await page.getByLabel('نام', { exact: true }).fill('کاربر تست بدون کد')
  await page.locator('input[autocomplete="username"]').fill(username)
  await page.getByRole('button', { name: 'ادامه', exact: true }).click()
  await page.locator('input[name="password"]').fill('Qa-NoOtp-9091!')
  await page.locator('input[name="passwordConfirm"]').fill('Qa-NoOtp-9091!')
  await page.getByRole('button', { name: 'ساخت حساب و ورود', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/profile', { timeout: 20_000 })

  const [user] = await db
    .select({
      id: appUser.id,
      phone: appUser.phone,
      phoneVerifiedAt: appUser.phoneVerifiedAt,
      passwordHash: appUser.passwordHash,
      status: appUser.status,
    })
    .from(appUser)
    .where(eq(appUser.username, username))
    .limit(1)

  assert.ok(user, 'کاربر در دیتابیس ساخته نشد')
  assert.equal(user.phone, null, 'شمارهٔ تأییدنشده نباید ذخیره شود')
  assert.equal(user.phoneVerifiedAt, null)
  assert.ok(user.passwordHash)
  assert.equal(user.status, 'active')
  assert.deepEqual(runtimeErrors, [])

  console.log(`✓ حساب ${username} بدون OTP ساخته شد، وارد پروفایل شد و رکورد دیتابیس معتبر بود`)
  await context.close()
} finally {
  await browser.close()
  await db.delete(appUser).where(eq(appUser.username, username))
  await closeDb()
}
