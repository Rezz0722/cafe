/** Read-only public discovery UX: never submits forms or analytics writes. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'http://127.0.0.1:9095').replace(/\/$/, '')
const output = process.argv[3] ?? 'var/qa/public-discovery-pages'
const sizes = [{ width: 320, height: 568 }, { width: 360, height: 800 }, { width: 390, height: 844 },
  { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]
const routes = [
  ['experience-hub', '/mashhad/experience'], ['experience-work', '/mashhad/experience/work'],
  ['experience-breakfast', '/mashhad/experience/breakfast'], ['experience-page2', '/mashhad/experience/breakfast?page=2'],
  ['district-hub', '/mashhad'], ['district-vakilabad', '/mashhad/vakilabad'], ['district-page2', '/mashhad/vakilabad?page=2'],
] as const
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const metrics: Record<string, unknown>[] = []
try {
  for (const viewport of sizes) for (const theme of ['light', 'dark']) for (const [name, path] of routes) {
    const page = await browser.newPage({ viewport, locale: 'fa-IR', serviceWorkers: 'block', reducedMotion: 'reduce' })
    await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort())
    await page.route('**/api/*track**', route => route.fulfill({ status: 204 }))
    await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(origin + path, { waitUntil: 'domcontentloaded' })
    assert.equal(response?.status(), 200, path)
    await page.evaluate(() => document.fonts.ready)
    for (const img of await page.locator('main img').all()) {
      await img.scrollIntoViewIfNeeded()
      await img.evaluate(async node => {
        const image = node as HTMLImageElement
        if (!image.complete) await new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 6000) })
      })
    }
    const state = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight, canonical: document.querySelector<HTMLLinkElement>('link[rel=canonical]')?.href,
      broken: [...document.querySelectorAll<HTMLImageElement>('main img')].filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src),
      cards: [...document.querySelectorAll('[data-discovery-card]')].map(card => card.getAttribute('data-discovery-card')),
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent ?? '{}')),
    }))
    assert.ok(state.scrollWidth <= state.width + 1, `${name}/${viewport.width}/${theme}: overflow`)
    assert.deepEqual(state.broken, [], `${name}: broken image`)
    assert.deepEqual(errors, [], `${name}: browser error`)
    assert.ok(state.canonical)
    if (name.includes('page2')) {
      assert.ok(state.canonical.includes('page=2'))
      assert.equal(await page.locator('nav[aria-label="صفحه‌های نتایج"] a[aria-current=page]').innerText(), '۲')
    }
    if (name !== 'experience-hub' && name !== 'district-hub') {
      assert.ok(state.cards.length > 0 && state.cards.length <= 12)
      assert.equal(new Set(state.cards).size, state.cards.length)
    }
    if (name === 'experience-hub') {
      assert.ok(await page.locator('[data-experience-track="card_click"]').count() >= 10)
      if (viewport.width <= 680) assert.equal(await page.locator('[class*="experienceGrid"]').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length), 2)
    }
    if (name === 'district-hub') {
      await page.getByRole('searchbox', { name: 'جست‌وجوی محله' }).fill('وکیل آباد')
      await page.getByRole('link', { name: /وکیل‌آباد/ }).first().waitFor()
      await page.getByRole('button', { name: 'پاک‌کردن جست‌وجو' }).click()
    }
    const pagination = page.locator('nav[aria-label="صفحه‌های نتایج"]')
    if (await pagination.count()) {
      await pagination.scrollIntoViewIfNeeded()
      await pagination.evaluate(node => node.scrollIntoView({ block: 'center' }))
      const nav = page.getByRole('navigation', { name: 'دسترسی سریع موبایل' })
      if (await nav.isVisible()) {
        const cta = await pagination.boundingBox(); const bottom = await nav.boundingBox()
        assert.ok(cta && bottom && cta.y + cta.height <= bottom.y, 'pagination hidden by bottom navigation')
      }
    }
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0) })
    if (viewport.width === 390 || (viewport.width === 1440 && theme === 'light')) await page.screenshot({ path: `${output}/${name}-${viewport.width}-${theme}.jpg`, type: 'jpeg', quality: 84, fullPage: true })
    metrics.push({ name, path, viewport, theme, ...state, errors })
    await page.close()
  }
  // Compare adjacent SSR pages and actual browser history, not just a count.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await page.route('**/api/*track**', route => route.fulfill({ status: 204 }))
  for (const path of ['/mashhad/experience/breakfast', '/mashhad/vakilabad']) {
    await page.goto(origin + path)
    const first = await page.locator('[data-discovery-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-discovery-card')))
    await page.getByRole('link', { name: 'صفحه بعد', exact: true }).click()
    await page.waitForURL(url => url.searchParams.get('page') === '2')
    await page.locator('a[aria-current="page"][aria-label="صفحه ۲"]').waitFor()
    const second = await page.locator('[data-discovery-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-discovery-card')))
    assert.equal(second.some(id => first.includes(id)), false)
    await page.reload()
    assert.deepEqual(await page.locator('[data-discovery-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-discovery-card'))), second)
    await page.goBack(); await page.waitForURL(url => !url.searchParams.has('page'))
    await page.locator('a[aria-current="page"][aria-label="صفحه ۱"]').waitFor()
    assert.deepEqual(await page.locator('[data-discovery-card]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-discovery-card'))), first)
    await page.goForward(); await page.waitForURL(url => url.searchParams.get('page') === '2')
    await page.locator('a[aria-current="page"][aria-label="صفحه ۲"]').waitFor()
  }
  await page.close()
  const noJs = await browser.newPage({ javaScriptEnabled: false })
  await noJs.goto(origin + '/mashhad/experience/breakfast?page=2')
  assert.equal(await noJs.locator('[data-discovery-card]').count(), 12)
  assert.ok(await noJs.getByRole('link', { name: 'صفحه قبل', exact: true }).count())
  await noJs.close()
  await writeFile(`${output}/metrics.json`, JSON.stringify(metrics, null, 2))
  console.log(`PASS discovery pages: ${metrics.length} viewport/theme/route cases; SSR pagination, history and no-JS passed`)
} finally { await browser.close() }
