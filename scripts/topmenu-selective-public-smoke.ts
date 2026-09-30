import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { eq } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/connection'
import { appUser } from '../src/db/schema'
import { createAuthSession, revokeSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'

// Public post-deploy UI check. Valid job requests are intercepted: no scrape or
// price apply is started. Only this short-lived test account/session is written.
const bases = process.argv.slice(2)
assert.ok(bases.length > 0)
for (const base of bases) assert.ok(['https://kucafe.ir', 'https://dev.kucafe.ir'].includes(base))
const db = getDb(), userId = randomUUID()
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-swiftshader'] })
let sessionId: string | undefined
try {
  await db.insert(appUser).values({ id: userId, username: `sync_ui_${userId.slice(0, 8)}`, name: 'آزمون موقت انتخاب اسکرپ', role: 'admin' })
  sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 600000), userAgent: 'selective-sync-public-qa' })
  const token = createSessionToken({ sessionId, userId, phone: '', role: 'admin' }, 600)
  await mkdir('var/qa/topmenu-selection', { recursive: true })
  for (const base of bases) for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 })
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true, secure: true }])
    const page = await context.newPage(), errors: string[] = [], sent: Record<string, unknown>[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/admin/topmenu-sync', async route => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'درخواست آزمون دریافت شد؛ عملیات واقعی اجرا نمی‌شود.' }) })
    })
    page.on('dialog', dialog => dialog.accept())
    assert.equal((await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 }))?.status(), 200)
    await page.getByRole('button', { name: 'عملیات', exact: true }).click()
    const picker = page.getByRole('group', { name: '۱. کدام کافه‌ها اسکرپ شوند؟' })
    await picker.waitFor()
    await picker.getByRole('radio', { name: 'انتخاب کافه‌ها', exact: true }).check()
    const clear = picker.getByRole('button', { name: 'پاک‌کردن انتخاب‌ها' })
    if (await clear.isEnabled()) await clear.click()
    assert.ok(await page.getByRole('button', { name: 'اسکرپ ۰ کافهٔ انتخاب‌شده' }).isDisabled())
    const checkbox = picker.getByRole('checkbox').first()
    assert.ok(await picker.getByRole('checkbox').count() > 0)
    await checkbox.check()
    await picker.getByRole('searchbox').fill('عبارت بدون نتیجه آزمون انتخاب')
    assert.equal(await picker.getByRole('checkbox').count(), 0)
    await picker.getByRole('searchbox').fill('')
    assert.ok(await checkbox.isChecked())
    await page.getByRole('button', { name: 'اسکرپ ۱ کافهٔ انتخاب‌شده' }).click()
    await page.getByText('درخواست آزمون دریافت شد؛ عملیات واقعی اجرا نمی‌شود.', { exact: true }).waitFor()
    assert.equal(sent.length, 1); assert.equal(sent[0].scope, 'selected')
    assert.equal((sent[0].sourceIds as number[]).length, 1)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    assert.deepEqual(errors, [])
    await picker.screenshot({ path: `var/qa/topmenu-selection/public-${new URL(base).hostname}-${width}.png` })
    assert.equal((await context.request.post(`${base}/api/admin/topmenu-sync`, { headers: { Origin: base }, data: { mode: 'scrape', scope: 'selected', sourceIds: [] } })).status(), 400)
    await context.close()
    console.log(`✓ ${base} ${width}: live checkbox picker, empty disabled, selection preserved, scoped payload intercepted, no overflow/runtime errors; real API rejects empty selection`)
  }
} finally {
  await browser.close()
  if (sessionId) await revokeSession(sessionId)
  await db.delete(appUser).where(eq(appUser.id, userId)); await closeDb()
}
