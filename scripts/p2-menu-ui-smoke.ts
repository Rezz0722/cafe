/** Authenticated browser smoke against a disposable MariaDB only. Never point this at Production. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { eq, inArray } from 'drizzle-orm'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { createAuthSession, revokeSession } from '../src/core/auth/userRepo'
import { closeDb, getDb } from '../src/db/connection'
import { appUser, auditLog, menuItem, menuSection, place, userPlaceRole } from '../src/db/schema'

const url = new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname === '127.0.0.1' && url.pathname === '/kucafe_menu_import_test', 'Disposable database required; production forbidden')
const base = process.env.P2_QA_BASE_URL || 'http://127.0.0.1:3099'
assert.ok(new URL(base).hostname === '127.0.0.1', 'QA browser must use loopback')
const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12), userId = randomUUID()
let placeId = 0, sectionId = 0, sessionId = ''
const itemIds: number[] = []
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await db.insert(appUser).values({ id: userId, name: 'QA owner', role: 'owner' })
  const [createdPlace] = await db.insert(place).values({ slug: `qa-p2-ui-${suffix}`, name: 'کافه آزمایشی', nameNormalized: 'کافه آزمایشی', status: 'published' })
  placeId = createdPlace.insertId
  await db.insert(userPlaceRole).values({ userId, placeId, role: 'owner' })
  const [createdSection] = await db.insert(menuSection).values({ placeId, name: 'دسته آزمایشی', branchScope: 'branch' })
  sectionId = createdSection.insertId
  for (const [index, name] of ['لاته تست', 'چای تست', 'آب تست'].entries()) {
    const [created] = await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa-p2-ui-${suffix}-${index}`,
      name, nameNormalized: name, price: index === 2 ? 0 : 100000 })
    itemIds.push(created.insertId)
  }
  sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 10 * 60_000), userAgent: 'p2-menu-ui-smoke' })
  const token = createSessionToken({ sessionId, userId, phone: '', role: 'owner' }, 10 * 60)
  browser = await chromium.launch({ headless: true, timeout: 20_000 })
  await mkdir('var/qa/p2-menu-ui', { recursive: true })
  for (const width of [320, 360, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 840 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran',
      isMobile: width < 600, hasTouch: width < 600 })
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true, secure: false }])
      const page = await context.newPage(), errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const response = await page.goto(`${base}/admin/venue?place=${placeId}`, { waitUntil: 'domcontentloaded' })
      assert.equal(response?.status(), 200)
      await page.getByRole('button', { name: 'منو و قیمت', exact: true }).click()
      await page.getByRole('heading', { name: 'مدیریت گروهی آیتم‌های انتخاب‌شده' }).waitFor()
      await page.getByRole('checkbox', { name: 'انتخاب لاته تست برای عملیات گروهی' }).check()
      await page.getByRole('checkbox', { name: 'انتخاب چای تست برای عملیات گروهی' }).check()
      await page.locator('#menu-batch-operation').selectOption('unavailable')
      await page.getByRole('button', { name: 'پیش‌نمایش بدون ثبت' }).click()
      await page.getByText(/قابل تغییر/).waitFor()
      assert.ok(await page.getByRole('button', { name: /تأیید و اعمال روی/ }).isDisabled())
      const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
      assert.ok(size.scroll <= size.client + 1, `horizontal overflow at ${width}: ${size.scroll}/${size.client}`)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: `var/qa/p2-menu-ui/owner-menu-${width}.png` })
      if (width === 360) {
        await page.getByText('بازیابی کنترل‌شده از خروجی CSV یا JSON کو کافه').click()
        const portable = { format: 'kucafe-menu', version: 1, priceUnit: 'toman', place: { slug: 'qa' }, sections: [
          { name: 'دسته تازه', scope: 'branch', items: [{ publicId: 'foreign-source', name: 'موکا تازه', description: null,
            price: 0, priceUnknown: false, available: true, featured: false, archived: false, excludeFromPriceStats: false,
            imageUrl: null, variants: [] }] },
        ] }
        await page.getByRole('textbox', { name: 'متن فایل برای بررسی' }).fill(JSON.stringify(portable))
        assert.ok(await page.getByRole('button', { name: 'بررسی و پیش‌نمایش؛ بدون ثبت' }).evaluate(button => button.closest('form')!.checkValidity()), 'portable form invalid before preview')
        await page.getByRole('button', { name: 'بررسی و پیش‌نمایش؛ بدون ثبت' }).click()
        await page.getByRole('heading', { name: 'پیش‌نمایش JSON' }).waitFor()
        assert.ok(await page.getByText('موکا تازه').count())
        const after = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
        assert.ok(after.scroll <= after.client + 1)
        assert.deepEqual(errors, [])
        await page.screenshot({ path: 'var/qa/p2-menu-ui/portable-preview-360.png' })
      }
    } finally { await context.close() }
  }
  assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, placeId))).length, 3, 'preview must not write')
  console.log('P2 menu UI smoke passed: 320/360/430/1440, RTL owner session, previews, no overflow or writes')
} finally {
  if (browser) await browser.close()
  if (sessionId) await revokeSession(sessionId)
  await db.delete(auditLog).where(eq(auditLog.actorUserId, userId))
  if (itemIds.length) await db.delete(menuItem).where(inArray(menuItem.id, itemIds))
  if (sectionId) await db.delete(menuSection).where(eq(menuSection.id, sectionId))
  if (placeId) await db.delete(place).where(eq(place.id, placeId))
  await db.delete(appUser).where(eq(appUser.id, userId))
  await closeDb()
}
