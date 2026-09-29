import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { eq, inArray } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/connection'
import { appUser, place } from '../src/db/schema'
import { createAuthSession, revokeSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
const artifact = process.argv[2]
assert.match(artifact ?? '', /^\.next-topmenu-[A-Za-z0-9]+$/)
const db = getDb(), userId = randomUUID(), root = await mkdtemp('/tmp/kucafe-topmenu-ui-')
const base = 'http://127.0.0.1:9095', runId = 'qa-ui-selection'
const targets = [{ sourceId: 2000000101, name: 'کافه آزمون انتخاب اول با نام طولانی برای کنترل عرض موبایل' }, { sourceId: 2000000102, name: 'کافه آزمون انتخاب دوم' }]
assert.equal((await db.select({ id: place.id }).from(place).where(inArray(place.sourceId, targets.map(target => target.sourceId)))).length, 0)
await mkdir(join(root, 'runs', runId), { recursive: true })
await writeFile(join(root, 'runs', runId, 'cafes_full_latest.json'), JSON.stringify(targets.map(target => ({ 'شناسه': target.sourceId, 'نام مجموعه': target.name, 'منو': [] }))))
await writeFile(join(root, 'state.json'), JSON.stringify({ runId, status: 'ready', report: { sourceCafes: 2, matchedCafes: 2,
  matchedItems: 0, unchangedItems: 0, failedCafes: 0, totalChanges: 0, totalNewCafes: 0, totalNewItems: 0, totalNewSections: 0,
  totalUpdatedItems: 0, totalMovedItems: 0, totalReactivatedItems: 0, totalArchivedItems: 0, totalConflicts: 0,
  priceChanges: 0, priceIncreases: 0, priceDecreases: 0, availabilityChanges: 0, newCafes: [], newItems: [], conflicts: [], changes: [], cafes: [] } }))
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '9095'],
 { cwd: '/var/www/kucafe', env: { ...process.env, NODE_ENV: 'production', NEXT_DIST_DIR: artifact, TOPMENU_SYNC_ROOT: root }, stdio: 'ignore' })
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-swiftshader'] })
let sessionId: string | undefined
try {
  await db.insert(appUser).values({ id: userId, username: `sync_ui_${userId.slice(0,8)}`, name: 'آزمون موقت انتخاب اسکرپ', role: 'admin' })
  sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 600000), userAgent: 'selective-sync-qa' })
  const token = createSessionToken({ sessionId, userId, phone: '', role: 'admin' }, 600)
  for (let tries = 0; tries < 30; tries++) { try { if ((await fetch(base)).ok) break } catch {} await new Promise(resolve => setTimeout(resolve, 500)) }
  await mkdir('var/qa/topmenu-selection', { recursive: true })
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 })
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true }])
    const page = await context.newPage(), errors: string[] = [], sent: Record<string, unknown>[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/admin/topmenu-sync', async route => {
      sent.push(route.request().postDataJSON())
      await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'درخواست آزمون دریافت شد؛ عملیات واقعی اجرا نمی‌شود.' }) })
    })
    page.on('dialog', dialog => dialog.accept())
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.getByRole('button', { name: 'عملیات', exact: true }).click()
    const scrape = page.getByRole('group', { name: '۱. کدام کافه‌ها اسکرپ شوند؟' })
    const apply = page.getByRole('group', { name: '۲. تغییرات کدام کافه‌ها اعمال شوند؟' })
    await scrape.waitFor()
    assert.ok(await page.getByRole('button', { name: 'اسکرپ ۰ کافهٔ انتخاب‌شده' }).isDisabled())
    await scrape.getByRole('searchbox').fill(targets[0].name)
    const selected = scrape.getByRole('checkbox', { name: new RegExp(targets[0].name) }); await selected.check()
    await scrape.getByRole('searchbox').fill('نام غیر موجود آزمون')
    await scrape.getByRole('searchbox').fill('')
    assert.ok(await selected.isChecked())
    await page.getByRole('button', { name: 'اسکرپ ۱ کافهٔ انتخاب‌شده' }).click()
    await page.getByText('درخواست آزمون دریافت شد؛ عملیات واقعی اجرا نمی‌شود.', { exact: true }).waitFor()
    assert.equal(sent[0].scope, 'selected'); assert.deepEqual(sent[0].sourceIds, [targets[0].sourceId])
    await scrape.screenshot({ path: `var/qa/topmenu-selection/scrape-picker-${width}.png` })
    assert.ok(await page.getByRole('button', { name: 'بکاپ و اعمال تغییرات انتخاب‌شده' }).isDisabled())
    await apply.getByRole('checkbox').first().check()
    await page.locator('input[name="confirm"]').fill('همگام‌سازی کامل')
    const applyResponse = page.waitForResponse(response => response.url().endsWith('/api/admin/topmenu-sync'))
    await page.getByRole('button', { name: 'بکاپ و اعمال تغییرات انتخاب‌شده' }).click(); await applyResponse
    assert.equal(sent[1].mode, 'apply'); assert.equal(sent[1].runId, runId); assert.deepEqual(sent[1].sourceIds, [targets[0].sourceId])
    await apply.screenshot({ path: `var/qa/topmenu-selection/apply-picker-${width}.png` })
    await scrape.getByRole('radio', { name: 'همهٔ کافه‌های منبع، شامل کافه‌های جدید' }).check()
    const fullResponse = page.waitForResponse(response => response.url().endsWith('/api/admin/topmenu-sync'))
    await page.getByRole('button', { name: 'اسکرپ همه و ساخت گزارش' }).click(); await fullResponse
    assert.equal(sent[2].scope, 'all'); assert.deepEqual(sent[2].sourceIds, [])
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    assert.deepEqual(errors, [])
    await page.screenshot({ path: `var/qa/topmenu-selection/admin-${width}.png`, fullPage: true })
    await context.close(); console.log(`✓ ${width}: checkbox/search persistence, selected scrape/apply payload, explicit all, empty disabled, no overflow or runtime errors`)
  }
  const context = await browser.newContext()
  const unauthenticated = await context.request.post(`${base}/api/admin/topmenu-sync`, { headers: { Origin: base }, data: { mode: 'scrape', scope: 'selected', sourceIds: [] } })
  assert.equal(unauthenticated.status(), 401)
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: base, httpOnly: true }])
  for (const payload of [{ mode: 'scrape', scope: 'selected', sourceIds: [] }, { mode: 'scrape', scope: 'selected', sourceIds: ['1'] }, { mode: 'scrape' }, { mode: 'apply', scope: 'selected', sourceIds: [targets[0].sourceId], confirm: 'همگام‌سازی کامل' }])
    assert.equal((await context.request.post(`${base}/api/admin/topmenu-sync`, { headers: { Origin: base }, data: payload })).status(), 400)
  assert.equal((await context.request.post(`${base}/api/admin/topmenu-sync`, { headers: { Origin: 'https://invalid.test' }, data: { mode: 'scrape', scope: 'all', sourceIds: [] } })).status(), 403)
  assert.equal((await context.request.post(`${base}/api/admin/topmenu-sync`, { headers: { Origin: base }, data: { mode: 'apply', scope: 'selected', sourceIds: [targets[0].sourceId], runId: 'old-run', confirm: 'همگام‌سازی کامل' } })).status(), 409)
  console.log('✓ Real API: auth/CSRF/empty/invalid/old-report rejected without starting any worker')
  const recovery = await context.newPage()
  for (const malformed of [{ error: 'incomplete snapshot' }, [{ 'شناسه': 2000000101, 'نام مجموعه': 'آزمون', 'منو': 'bad tree' }]]) {
    await writeFile(join(root, 'runs', runId, 'cafes_full_latest.json'), JSON.stringify(malformed))
    assert.equal((await recovery.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 120000 }))?.status(), 200)
    await recovery.getByRole('button', { name: 'عملیات', exact: true }).click()
    await recovery.getByRole('group', { name: '۱. کدام کافه‌ها اسکرپ شوند؟' }).waitFor()
    assert.ok(await recovery.getByRole('button', { name: 'بکاپ و اعمال تغییرات انتخاب‌شده' }).isDisabled())
  }
  await context.close(); console.log('✓ Malformed/incomplete snapshot does not crash admin; unsafe apply remains disabled')
} finally {
  await browser.close(); server.kill('SIGTERM')
  if (sessionId) await revokeSession(sessionId)
  await db.delete(appUser).where(eq(appUser.id, userId)); await closeDb()
  assert.ok(root.startsWith('/tmp/kucafe-topmenu-ui-')); await rm(root, { recursive: true, force: true })
}
