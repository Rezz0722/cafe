import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit, type Page } from 'playwright'

// Public journeys only. No SMS, registration, review or menu writes.
const base = process.argv[2] ?? 'https://kucafe.ir'
const output = 'var/qa/phase0/browser'
await mkdir(output, { recursive: true })
const results: object[] = []
const engines = process.env.KUCAFE_QA_ENGINE?.split(',')
const widths = process.env.KUCAFE_QA_WIDTHS?.split(',').map(Number) ?? [360, 390, 768, 1440]
let failures = 0
const assertFits = async (page: Page) => {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(size.scroll <= size.width + 1, `horizontal overflow ${size.scroll}/${size.width}`)
}

for (const [engine, launcher] of Object.entries({ chromium, firefox, webkit })) {
  if (engines && !engines.includes(engine)) continue
  let browser
  try {
    browser = await launcher.launch({ headless: true })
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', serviceWorkers: 'block', reducedMotion: 'no-preference' })
      await context.route('**/api/track', route => route.fulfill({ status: 204 }))
      const page = await context.newPage()
      page.setDefaultTimeout(30_000)
      let stage = 'home'
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      try {
        await page.goto(base, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { level: 1, name: /کافه‌ای پیدا کن/ }).waitFor()
        await assertFits(page)
        const form = page.locator('form[role="search"]').filter({ has: page.locator('#home-search') })
        assert.equal(await form.count(), 1)
        const orbit = form.locator('svg rect').first()
        const a = await orbit.evaluate(el => ({ length: (el as SVGRectElement).getTotalLength(), offset: getComputedStyle(el).strokeDashoffset, animation: getComputedStyle(el).animationName }))
        await page.waitForFunction(start => {
          const el = document.querySelector('form[role="search"] svg rect')
          return el && getComputedStyle(el).strokeDashoffset !== start
        }, a.offset)
        const b = await orbit.evaluate(el => getComputedStyle(el).strokeDashoffset)
        assert.ok(a.length > 100 && a.animation !== 'none', 'SVG path exists and has active animation')
        assert.notEqual(a.offset, b, 'orbit progresses on desktop and mobile viewport')
        const frame = await form.evaluate(el => {
          const f = el.getBoundingClientRect(), s = el.querySelector('svg')!.getBoundingClientRect()
          return Math.max(Math.abs(f.x - s.x), Math.abs(f.y - s.y), Math.abs(f.width - s.width), Math.abs(f.height - s.height))
        })
        assert.ok(frame < 2, `SVG follows actual search frame: ${frame}`)
        await page.screenshot({ path: `${output}/${engine}-${width}-home.png` })
        stage = 'home search submit'
        await form.getByRole('searchbox', { name: 'جست‌وجوی کافه، منو و محله' }).fill('پاستا')
        await form.getByRole('button', { name: 'پیدا کن' }).click()
        await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'پاستا')
        await page.locator('a[href^="/item/"]').first().waitFor()
        assert.ok(await page.locator('a[href^="/item/"]').count() > 0, 'food search has real item results')
        await assertFits(page)
        stage = 'menu categories'
        await page.goto(`${base}/cafe/ramouz-cafe?menu=1`, { waitUntil: 'networkidle' })
        const picker = page.getByRole('dialog', { name: 'دسته‌بندی‌های منو', exact: true })
        await picker.waitFor()
        const cards = picker.locator('[class*="categoryGrid"] button')
        assert.ok(await cards.count() > 1)
        if (width <= 390) {
          const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox()
          assert.ok(first && second && Math.abs(first.y - second.y) < 2, 'mobile categories use two columns')
        }
        await assertFits(page)
        await page.screenshot({ path: `${output}/${engine}-${width}-categories.png` })
        await cards.first().click()
        await picker.waitFor({ state: 'hidden' })
        const menu = page.locator('#menu')
        await menu.locator('ul[class*="items"] > li').first().waitFor()
        const selected = menu.locator('[class*="sectionHead"]').first()
        if (width <= 390) {
          assert.equal(await selected.locator('picture').isVisible(), false)
          const product = await menu.locator('ul[class*="items"] > li').first().boundingBox()
          assert.ok(product && product.y < 450, 'products visible after category choice')
        }
        await menu.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' }).fill('لاته')
        assert.ok(await menu.locator('ul[class*="items"] > li').count() > 0)
        await menu.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' }).fill('')
        stage = 'menu display mode'
        await menu.getByRole('button', { name: 'ساده', exact: true }).click()
        await menu.getByRole('button', { name: 'ساده', exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor()
        await menu.getByRole('button', { name: 'تصویری', exact: true }).click()
        const categoryUrl = page.url()
        await menu.locator('a[href^="/item/"]').first().click()
        await page.waitForURL(/\/item\//)
        await page.goBack({ waitUntil: 'networkidle' })
        assert.equal(page.url(), categoryUrl)
        await assertFits(page)
        assert.deepEqual(errors, [])
        results.push({ engine, width, status: 'pass', orbit: { start: a.offset, end: b, length: a.length, frameDifference: frame } })
        console.log(`PASS ${engine} ${width}: search, menu, category, product, Back, orbit`)
      } catch (error) {
        failures++
        results.push({ engine, width, stage, url: page.url(), status: 'fail', error: String(error), runtimeErrors: errors })
        await page.screenshot({ path: `${output}/${engine}-${width}-failure.png` }).catch(() => {})
        console.error(`FAIL ${engine} ${width}: ${String(error)}`)
      } finally { await context.close() }
    }
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' })
    await context.route('**/api/track', route => route.fulfill({ status: 204 }))
    const page = await context.newPage()
    await page.goto(base, { waitUntil: 'networkidle' })
    assert.equal(await page.locator('form[role="search"] svg rect').first().evaluate(el => getComputedStyle(el).animationName), 'none')
    await page.goto(`${base}/for-cafes`)
    assert.ok(await page.locator('a[href^="tel:"]').count() > 0)
    assert.ok(await page.locator('a[href*="t.me/"]').count() > 0)
    await page.goto(`${base}/admin/venue`)
    assert.equal(new URL(page.url()).pathname, '/auth')
    await page.goto(`${base}/profile`)
    assert.equal(new URL(page.url()).pathname, '/auth')
    await context.close()
    const noJs = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' })
    const staticPage = await noJs.newPage()
    await staticPage.goto(base)
    await staticPage.locator('#home-search').fill('پاستا')
    await staticPage.locator('form[role="search"]').filter({ has: staticPage.locator('#home-search') }).getByRole('button', { name: 'پیدا کن' }).click()
    await staticPage.waitForURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'پاستا')
    await staticPage.locator('a[href^="/item/"]').first().waitFor()
    assert.ok(await staticPage.locator('a[href^="/item/"]').count() > 0)
    await noJs.close()
    results.push({ engine, status: 'pass', checks: ['reduced-motion', 'B2B contacts', 'private routes redirect', 'search without JS'] })
  } catch (error) {
    failures++
    results.push({ engine, status: 'fail', error: String(error) })
    console.error(`FAIL ${engine}: ${String(error)}`)
  } finally { await browser?.close() }
}
await writeFile(`${output}/matrix.json`, JSON.stringify({ testedAt: new Date().toISOString(), base, failures, results }, null, 2))
if (failures) process.exitCode = 1
