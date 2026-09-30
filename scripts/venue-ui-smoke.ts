import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { createAuthSession, findUserByLogin, revokeSession } from '../src/core/auth/userRepo'
import { closeDb } from '../src/db/connection'

const identifier = process.argv[2]
const base = process.argv[3] ?? 'http://127.0.0.1:9091'
if (!identifier) throw new Error('شماره یا نام کاربری مدیر را بدهید.')

const user = await findUserByLogin(identifier)
if (!user || user.status !== 'active') throw new Error('حساب فعال پیدا نشد.')
const sessionId = await createAuthSession({
  userId: user.id,
  method: 'password',
  expiresAt: new Date(Date.now() + 10 * 60_000),
  userAgent: 'venue-ui-smoke',
})
const token = createSessionToken({ sessionId, userId: user.id, phone: user.phone, role: user.role }, 10 * 60)
await mkdir('var/qa', { recursive: true })

console.log('… اجرای Chromium')
const browser = await chromium.launch({ headless: true, timeout: 15_000 })
let failures = 0

async function checkViewport(label: 'mobile' | 'desktop', viewport: { width: number; height: number }) {
  console.log(`… بررسی ${label}`)
  const context = await browser.newContext({ viewport, locale: 'fa-IR', timezoneId: 'Asia/Tehran', isMobile: label === 'mobile', hasTouch: label === 'mobile' })
  try {
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true, secure: base.startsWith('https:') }])
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    page.setDefaultNavigationTimeout(30_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
    page.on('requestfailed', (request) => {
      const reason = request.failure()?.errorText ?? ''
      // Next.js هنگام جابه‌جایی تب، prefetch کم‌اولویت را عمداً لغو می‌کند.
      if (!reason.includes('ERR_ABORTED')) errors.push(`request: ${request.url()} — ${reason}`)
    })

    console.log(`… ${label}: بارگذاری پنل`)
    const response = await page.goto(`${base}/admin/venue?place=154`, { waitUntil: 'domcontentloaded' })
    assert.equal(response?.status(), 200)
    await page.getByRole('heading', { name: /کافه رستوران پئونیا/ }).waitFor()
    await assertNoOverflow(page, `${label} overview`)

    const tabs = page.locator('nav[aria-label="بخش‌های پنل"] button')
    assert.equal(await tabs.count(), 8)
    if (label === 'mobile') {
      const boxes = await tabs.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
      assert.ok(boxes.every((height) => height >= 44), 'ارتفاع تب موبایل کمتر از ۴۴ پیکسل است')
    }

    console.log(`… ${label}: تصاویر`)
    await page.getByRole('button', { name: 'تصاویر', exact: true }).click()
    await page.getByText('تصاویر محیط شعبه').waitFor()
    await assertNoOverflow(page, `${label} media`)
    await page.screenshot({ path: `var/qa/phase2-venue-${label}-media.png`, timeout: 15_000 })

    console.log(`… ${label}: منو`)
    await page.getByRole('button', { name: 'منو و قیمت', exact: true }).click()
    await page.getByPlaceholder('جست‌وجو در نام یا توضیح آیتم…').waitFor()
    assert.equal(await page.locator('[role="tablist"][aria-label="دسته‌های منو"] button').count(), 16)
    assert.ok(await page.locator('details').count() < 80, 'منوی بزرگ نباید صدها editor را هم‌زمان رندر کند')
    await assertNoOverflow(page, `${label} menu`)
    await page.screenshot({ path: `var/qa/phase2-venue-${label}-menu.png`, timeout: 15_000 })

    console.log(`… ${label}: QR`)
    await page.getByRole('button', { name: 'QR منو', exact: true }).click()
    await page.locator('img[alt^="QR منوی"]').waitFor()
    await assertNoOverflow(page, `${label} qr`)
    await page.screenshot({ path: `var/qa/phase2-venue-${label}-qr.png`, timeout: 15_000 })

    if (errors.length) throw new Error(errors.join('\n'))
    console.log(`✓ پنل ${label === 'mobile' ? 'موبایل' : 'دسکتاپ'}: بدون overflow، خطای runtime یا request شکست‌خورده`)
  } finally {
    await context.close()
  }
}

async function assertNoOverflow(page: Page, label: string) {
  const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  if (size.scroll > size.client + 1) {
    failures++
    throw new Error(`${label}: اسکرول افقی ${size.scroll}px روی viewport ${size.client}px`)
  }
}

try {
  await checkViewport('mobile', { width: 390, height: 844 })
  await checkViewport('desktop', { width: 1440, height: 1000 })
} finally {
  await browser.close()
  await revokeSession(sessionId)
  await closeDb()
}

process.exitCode = failures ? 1 : 0
