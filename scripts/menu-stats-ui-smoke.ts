import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit, type Page } from 'playwright'
import { and, eq, inArray, like } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/client'
import { appUser, dailyStat, menuItem, menuSection, place, setting, userPlaceRole } from '../src/db/schema'
import { createAuthSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'

const url = new URL(process.env.DATABASE_URL || '')
assert.ok(url.hostname === '127.0.0.1' && url.pathname === '/kucafe_menu_stats_test', 'No production fixtures')
const base = 'http://127.0.0.1:3204', db = getDb(), userId = randomUUID(), slug = `qa-stats-ui-${userId}`, results: object[] = []
let placeId = 0, itemId = 0, completed = false
await mkdir('var/qa/menu-stats', { recursive: true })
const count = async (metric: string) => (await db.select().from(dailyStat).where(and(eq(dailyStat.metric, metric), like(dailyStat.refId, `${placeId}:%`)))).reduce((sum, row) => sum + row.value, 0)
const waitCount = async (page: Page, metric: string, expected: number) => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) { if (await count(metric) === expected) return; await page.waitForTimeout(150) }
  assert.equal(await count(metric), expected, metric)
}
try {
  await db.insert(appUser).values({ id: userId, role: 'owner', name: 'QA owner', phone: '09123456782', phoneVerifiedAt: new Date() })
  const [p] = await db.insert(place).values({ slug, name: 'QA کافه آزمایشی', nameNormalized: 'qa', status: 'published', address: 'مشهد' }); placeId = p.insertId
  await db.insert(userPlaceRole).values({ userId, placeId, role: 'owner' })
  const [s] = await db.insert(menuSection).values({ placeId, name: 'قهوه تست', branchScope: 'branch' })
  const publicId = `mi_${userId.replaceAll('-', '').slice(0, 24)}`
  const [i] = await db.insert(menuItem).values({ placeId, sectionId: s.insertId, publicId, name: 'لاته تست', nameNormalized: 'لاته تست', price: 100000 }); itemId = i.insertId
  await db.insert(setting).values({ key: 'trackPageViews', value: true }).onDuplicateKeyUpdate({ set: { value: true } })
  const sessionId = await createAuthSession({ userId, method: 'otp', expiresAt: new Date(Date.now() + 3600000) })
  const cookie = { name: SESSION_COOKIE, value: createSessionToken({ userId, sessionId, role: 'owner', phone: '09123456782' }), url: base, httpOnly: true, sameSite: 'Lax' as const }
  for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const browser = await launcher.launch()
    try {
      for (const width of engine === 'chromium' ? [360, 390, 768, 1440] : [360, 1440]) {
        const beforeSection = await count('menu_section_views'), beforeItem = await count('menu_item_views')
        const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 KuCafe-QA-browser' })
        await context.route('**/api/track', route => route.fulfill({ status: 204 }))
        const page = await context.newPage(), errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.setDefaultTimeout(30000)
        await page.goto(`${base}/cafe/${slug}?menu=1`, { waitUntil: 'networkidle', timeout: 120000 })
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), width === 360 || width === 1440 ? 'dark' : 'light')
        const picker = page.getByRole('dialog', { name: 'دسته‌بندی‌های منو', exact: true }); await picker.waitFor()
        assert.equal(await count('menu_section_views'), beforeSection, 'Picker is not category view')
        await picker.getByRole('button', { name: /قهوه تست/ }).click()
        await page.getByRole('heading', { name: 'قهوه تست', exact: true }).scrollIntoViewIfNeeded()
        await waitCount(page, 'menu_section_views', beforeSection + 1)
        assert.equal(await count('menu_item_views'), beforeItem, 'Cards/prefetch not product detail views')
        const search = page.getByPlaceholder(/نام آیتم/)
        if (await search.count()) { await search.fill('لاته'); await page.waitForTimeout(1200); await search.fill(''); await page.waitForTimeout(1200) }
        assert.equal(await count('menu_section_views'), beforeSection + 1, 'Search/mode rerenders deduped')
        await page.locator(`a[href^="/item/${publicId}/"]`).filter({ visible: true }).first().click()
        await page.getByRole('heading', { name: 'لاته تست', exact: true }).waitFor()
        await page.getByRole('heading', { name: 'لاته تست', exact: true }).scrollIntoViewIfNeeded()
        await waitCount(page, 'menu_item_views', beforeItem + 1)
        await page.reload({ waitUntil: 'networkidle' }); await page.getByRole('heading', { name: 'لاته تست', exact: true }).scrollIntoViewIfNeeded(); await page.waitForTimeout(1500)
        assert.equal(await count('menu_item_views'), beforeItem + 1, 'Same-tab detail reload deduped')
        await context.addCookies([cookie])
        await page.goto(`${base}/admin/venue?place=${placeId}`, { waitUntil: 'networkidle', timeout: 120000 })
        const stats = page.getByRole('region', { name: 'مشاهده‌های منو · ۳۰ روز اخیر', exact: true }); await stats.waitFor()
        assert.match(await stats.innerText(), /قهوه تست/); assert.match(await stats.innerText(), /لاته تست/)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        assert.deepEqual(errors, [])
        if (engine === 'chromium' && [390, 1440].includes(width)) await stats.screenshot({ path: `var/qa/menu-stats/${engine}-${width}.png` })
        results.push({ engine, width, pass: true, checks: ['visible category only', 'prefetch not counted', 'detail page visible', 'same-tab repeat dedup', 'authenticated branch report', 'RTL/no overflow/no runtime errors'] })
        console.log('PASS menu stats', engine, width); await context.close()
      }
    } finally { await browser.close() }
  }
  const browser = await chromium.launch()
  try {
    for (const preference of ['dnt', 'sec-gpc']) {
      const before = await count('menu_item_views')
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 KuCafe-QA-browser', extraHTTPHeaders: { [preference]: '1' } })
      await context.route('**/api/track', route => route.fulfill({ status: 204 }))
      const page = await context.newPage(); await page.goto(`${base}/item/${publicId}/${encodeURIComponent('لاته-تست')}`, { waitUntil: 'networkidle' }); await page.getByRole('heading', { name: 'لاته تست', exact: true }).scrollIntoViewIfNeeded(); await page.waitForTimeout(1500)
      assert.equal(await count('menu_item_views'), before); results.push({ preference, pass: true }); await context.close()
    }
  } finally { await browser.close() }
  completed = true; console.log('PASS', results.length, 'menu stats browser journeys')
} finally {
  await writeFile('var/qa/menu-stats/browser.json', JSON.stringify({ completed, results, scope: 'Local real Next.js with disposable database. Simulated viewport, not physical device.' }, null, 2))
  if (placeId) { await db.delete(dailyStat).where(and(like(dailyStat.refId, `${placeId}:%`), inArray(dailyStat.metric, ['menu_section_views', 'menu_item_views']))); await db.delete(menuItem).where(eq(menuItem.id, itemId)); await db.delete(place).where(eq(place.id, placeId)) }
  await db.delete(appUser).where(eq(appUser.id, userId)); await closeDb()
}
