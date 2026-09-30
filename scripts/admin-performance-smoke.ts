import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { getPool, closeDb } from '../src/db/connection'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'
import { signClaims } from '../src/core/auth/token'
import { SESSION_SECRET } from '../src/core/config/env'
import { VIEW_AS_COOKIE } from '../src/core/auth/impersonation'

// Read-only diagnostic: existing sessions are used only in memory; no account,
// session, menu, scrape or data mutation is created. Browser POSTs are blocked.
const bases = process.argv.slice(2)
assert.ok(bases.length)
for (const base of bases) assert.match(base, /^https:\/\/(dev\.)?kucafe\.ir$|^http:\/\/127\.0\.0\.1:\d+$/)
const [rows] = await getPool().query(`SELECT s.id AS sid,u.id AS uid,u.phone,u.role
  FROM auth_session s JOIN app_user u ON u.id=s.user_id
  WHERE u.status='active' AND u.must_change_password=0 AND s.revoked_at IS NULL
    AND s.expires_at>UTC_TIMESTAMP() ORDER BY s.created_at DESC LIMIT 100`)
const sessions = rows as { sid: string; uid: string; phone: string | null; role: 'admin' | 'owner' | 'customer' }[]
const admin = sessions.find(session => session.role === 'admin')
assert.ok(admin, 'An existing active admin session is required; this check never creates one')
const normal = sessions.find(session => session.role !== 'admin')
const token = (session: typeof sessions[number]) => createSessionToken({ sessionId: session.sid, userId: session.uid, phone: session.phone ?? '', role: session.role }, 1800)
const adminToken = token(admin), cookie = `${SESSION_COOKIE}=${adminToken}`
const browser = await chromium.launch({ channel: 'chromium', headless: true })
await mkdir('var/qa/admin-performance', { recursive: true, mode: 0o700 })
try {
  for (const base of bases) {
    for (const path of ['/admin', '/admin/venue?place=154']) {
      const start = performance.now()
      const response = await fetch(base + path, { headers: { Cookie: cookie }, redirect: 'manual', signal: AbortSignal.timeout(30000) })
      const first = performance.now(); assert.equal(response.status, 200)
      const body = await response.text()
      assert.ok(body.includes('پنل مدیریت')); assert.ok(!body.includes('Application error:'))
      console.log(`✓ ${base}${path}: first byte ${Math.round(first - start)}ms, full response ${Math.round(performance.now() - start)}ms`)
    }
    assert.equal((await fetch(`${base}/api/admin/search-insights`)).status, 401)
    assert.equal((await fetch(`${base}/api/admin/search-insights`, { method: 'POST', headers: { Cookie: cookie } })).status, 405)
    for (const role of ['owner', 'customer']) {
      const deniedSession = sessions.find(session => session.role === role)
      if (deniedSession) {
        const denied = await fetch(`${base}/api/admin/search-insights`, { headers: { Cookie: `${SESSION_COOKIE}=${token(deniedSession)}` } })
        assert.equal(denied.status, 403)
        const staleAdminClaim = createSessionToken({ sessionId: deniedSession.sid, userId: deniedSession.uid, phone: deniedSession.phone ?? '', role: 'admin' }, 300)
        assert.equal((await fetch(`${base}/api/admin/search-insights`, { headers: { Cookie: `${SESSION_COOKIE}=${staleAdminClaim}` } })).status, 403)
      } else console.log(`⚠ No existing ${role} session: that live permission check skipped`)
    }
    if (normal) {
      const viewAs: string = signClaims({ actorId: admin.uid, targetId: normal.uid, exp: Math.floor(Date.now() / 1000) + 300 }, SESSION_SECRET)
      assert.equal((await fetch(`${base}/api/admin/search-insights`, { headers: { Cookie: `${cookie}; ${VIEW_AS_COOKIE}=${viewAs}` } })).status, 403)
    } else console.log('⚠ No existing non-admin session: non-admin/view-as live checks skipped, no test account created')
    // Only one cold real aggregation per backend; following concurrent calls
    // must return the identical server snapshot, not rerun the query.
    const coldStart = performance.now()
    const report = await fetch(`${base}/api/admin/search-insights`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(60000) })
    assert.equal(report.status, 200); assert.match(report.headers.get('cache-control') ?? '', /private.*no-store/)
    const data = await report.json(); assert.ok(Array.isArray(data.rows)); assert.ok(Number.isFinite(Date.parse(data.generatedAt)))
    console.log(`✓ ${base}: full-history report available (${Math.round(performance.now() - coldStart)}ms cold); anonymous/non-admin/view-as permissions checked where sessions exist`)
    const warmStart = performance.now()
    const repeated = await Promise.all([1, 2, 3].map(async () => {
      const response = await fetch(`${base}/api/admin/search-insights`, { headers: { Cookie: cookie } })
      assert.equal(response.status, 200); return response.json()
    }))
    for (const value of repeated) assert.deepEqual(value, data)
    console.log(`✓ ${base}: 3 warm parallel report requests ${Math.round(performance.now() - warmStart)}ms; same counts/timestamp; no public response cache`)

    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 700, hasTouch: width < 700 })
      await context.addCookies([{ name: SESSION_COOKIE, value: adminToken, url: base, httpOnly: true, secure: base.startsWith('https:') }])
      await context.route('**/*', async route => {
        if (!['GET', 'HEAD'].includes(route.request().method())) await route.abort()
        else await route.continue()
      })
      const page = await context.newPage(), errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      let requests = 0
      await page.route('**/api/admin/search-insights', async route => {
        requests++
        await new Promise(resolve => setTimeout(resolve, 1200))
        await route.fulfill(requests === 1 ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'خطای آزمایشی گزارش' }) }
          : { status: 200, contentType: 'application/json', body: JSON.stringify({ generatedAt: new Date().toISOString(), rows: [{ query: 'عبارت آزمون گزارش', facetIds: '', requestedScope: 'items', resolvedEntity: 'items', resolvedIntent: null, count: 11 }] }) }).catch(() => {})
      })
      await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.getByRole('button', { name: 'عملیات', exact: true }).click()
      assert.equal(requests, 0, 'Heavy insights must not load on panel entry or unrelated tabs')
      await page.getByRole('button', { name: 'بازدید', exact: true }).click()
      await page.getByText('گزارش در حال آماده‌شدن است؛ می‌توانید در بخش‌های دیگر پنل کار کنید.', { exact: true }).waitFor()
      await page.getByText('خطای آزمایشی گزارش', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click()
      await page.getByRole('listitem').filter({ hasText: 'عبارت آزمون گزارش' }).waitFor()
      assert.equal(requests, 2)
      await page.locator('h2').filter({ hasText: 'جست‌وجوهای بی‌نتیجه' }).scrollIntoViewIfNeeded()
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
      await page.screenshot({ path: `var/qa/admin-performance/insights-${new URL(base).hostname}-${width}.png` })
      await page.getByRole('button', { name: 'تنظیمات', exact: true }).click()
      await page.getByRole('heading', { name: 'جست‌وجوهای بی‌نتیجه', exact: true }).waitFor({ state: 'detached' })
      // Leaving while a new report request is pending must not update an
      // unmounted component, block a tab, or surface an application exception.
      await page.getByRole('button', { name: 'بازدید', exact: true }).click()
      await page.getByText('گزارش در حال آماده‌شدن است؛ می‌توانید در بخش‌های دیگر پنل کار کنید.', { exact: true }).waitFor()
      await page.getByRole('button', { name: 'عملیات', exact: true }).click()
      await page.getByRole('heading', { name: 'جست‌وجوهای بی‌نتیجه', exact: true }).waitFor({ state: 'detached' })
      await page.waitForTimeout(1500)
      assert.deepEqual(errors, [])
      await context.close()
      console.log(`✓ ${base} ${width}: deferred request, loading/error/retry, responsive report, tabs usable, no runtime errors; all writes blocked`)
    }
  }
} finally { await browser.close(); await closeDb() }
