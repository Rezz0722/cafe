/** Read-only homepage visual/interaction QA. Analytics are intercepted. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'http://127.0.0.1:9094').replace(/\/$/, '')
const output = process.argv[3] ?? 'var/qa/home-visual'
const before = process.argv[4] === 'before'
const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
]
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results: Record<string, unknown>[] = []
try {
  for (const viewport of viewports) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport, locale: 'fa-IR', serviceWorkers: 'block', reducedMotion: 'reduce' })
    for (const endpoint of ['track', 'experience-track', 'discovery-track']) {
      await page.route(`**/api/${endpoint}**`, route => route.fulfill({ status: 204 }))
    }
    await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto(origin, { waitUntil: 'domcontentloaded' })
    assert.equal(response?.status(), 200)
    await page.evaluate(() => document.fonts.ready)
    const images = page.locator('main img, footer img')
    const broken: string[] = []
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded()
      const valid = await image.evaluate(async node => {
        const img = node as HTMLImageElement
        if (!img.complete) await Promise.race([
          new Promise(resolve => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }) }),
          new Promise(resolve => setTimeout(resolve, 10_000)),
        ])
        return img.complete && img.naturalWidth > 0
      })
      if (!valid) broken.push(await image.getAttribute('src') ?? '')
    }
    await page.locator('[class*="experienceRail"], [class*="districtRail"], [class*="featuredGrid"]').evaluateAll(nodes => nodes.forEach(node => { node.scrollLeft = 0 }))
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0) })
    const metrics = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      bodyHeight: document.body.scrollHeight,
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
      jsonLd: document.querySelectorAll('script[type="application/ld+json"]').length,
      heroBottom: Math.round((document.querySelector('section[aria-labelledby="home-title"]')?.getBoundingClientRect().bottom ?? 0) + scrollY),
      reviewsTop: Math.round((document.querySelector('section[aria-labelledby="home-reviews-title"]')?.getBoundingClientRect().top ?? 0) + scrollY),
      foodTop: Math.round((document.querySelector('section[aria-labelledby="discovery-title"]')?.getBoundingClientRect().top ?? 0) + scrollY),
    }))
    assert.ok(metrics.scrollWidth <= metrics.width + 1, `${viewport.width}/${theme}: horizontal overflow`)
    assert.ok(metrics.canonical?.endsWith('/'))
    assert.ok(metrics.jsonLd > 0)
    assert.deepEqual(errors, [], `${viewport.width}/${theme}: browser errors`)
    assert.deepEqual(broken, [])
    let nextCardVisibleFraction: number | null = null
    if (!before) {
      const clippedCards = await page.locator('[class*="featuredEntry"] > a:first-of-type').evaluateAll(cards => cards.filter(card => card.scrollHeight > card.clientHeight + 2).length)
      assert.equal(clippedCards, 0, 'recommended cafe cards must not clip their body')
      assert.equal(await page.locator('a[data-discovery-source="food_discovery"] img[src^="/home/categories/"]').count(), 6)
      assert.equal(await page.getByText('قیمت‌های ثبت‌شده را ببین', { exact: true }).count(), 0)
      assert.equal(await page.getByRole('link', { name: 'نصب نرم افزار', exact: true }).count(), 1)
      assert.equal(await page.locator('main a[href="/install"]').count(), 0)
      if (viewport.width < 760) {
        for (const name of ['مشاهده همه تجربه‌ها', 'مشاهده همه محله‌ها']) {
          const cta = page.getByRole('link', { name, exact: true })
          assert.ok(await cta.isVisible())
          await cta.scrollIntoViewIfNeeded()
          await cta.evaluate(node => node.scrollIntoView({ block: 'center' }))
          const box = await cta.boundingBox()
          assert.ok(box && box.height >= 48 && box.y + box.height < viewport.height - 82, `${name}: bottom navigation collision`)
        }
        const rail = page.locator('[class*="experienceRail"]')
        if (await rail.locator('a').count() > 1) {
          assert.ok(await rail.evaluate(node => node.scrollWidth > node.clientWidth), 'experience swipe remains available')
          nextCardVisibleFraction = await rail.evaluate(node => {
            node.scrollLeft = 0
            const rail = node.getBoundingClientRect()
            const second = node.querySelectorAll('a')[1].getBoundingClientRect()
            return Math.max(0, Math.min(innerWidth, rail.right, second.right) - Math.max(0, rail.left, second.left)) / second.width
          })
          assert.ok(nextCardVisibleFraction >= .2 && nextCardVisibleFraction <= .85, `${viewport.width}: next experience card must be clearly partial (${nextCardVisibleFraction})`)
        }
      }
    }
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `${output}/first-fold-${viewport.width}-${theme}.jpg`, type: 'jpeg', quality: 88 })
    await page.screenshot({ path: `${output}/home-${viewport.width}-${theme}.jpg`, type: 'jpeg', quality: 84, fullPage: true })
    if (viewport.width === 390) {
      for (const [name, id] of [['reviews', 'home-reviews-title'], ['experiences', 'experience-title'], ['food', 'discovery-title'], ['districts', 'district-title']]) {
        const section = page.locator(`section[aria-labelledby="${id}"]`)
        if (await section.count()) await section.screenshot({
          path: `${output}/${name}-${theme}.jpg`, type: 'jpeg', quality: 88,
          // Isolated component evidence; full-page/viewport screenshots retain the real nav.
          style: 'nav[aria-label="دسترسی سریع موبایل"] { visibility: hidden !important; }',
        })
      }
    }
    results.push({ viewport, theme, ...metrics, nextCardVisibleFraction, images: await images.count(), broken, errors })
    await page.close()
  }

  // The real fallback route is available even without an installable browser.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  for (const endpoint of ['track', 'experience-track', 'discovery-track']) await page.route(`**/api/${endpoint}**`, r => r.fulfill({ status: 204 }))
  await page.goto(origin)
  if (!before) {
    for (const selector of ['a[data-discovery-source="food_discovery"]', 'a[data-experience-track="card_click"]', 'a[data-discovery-source="district"]']) {
      const target = await page.locator(selector).first().getAttribute('href')
      assert.ok(target?.startsWith('/mashhad/'), `valid discovery destination: ${selector}`)
      const response = await page.goto(new URL(target!, origin).href, { waitUntil: 'domcontentloaded' })
      assert.equal(response?.status(), 200, `discovery destination ${target}`)
      assert.ok(await page.getByRole('heading', { level: 1 }).isVisible())
      await page.goto(origin, { waitUntil: 'domcontentloaded' })
    }
    await page.getByRole('link', { name: 'نصب نرم افزار', exact: true }).click()
    await page.getByRole('heading', { name: 'نصب روی آیفون', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'نصب روی اندروید', exact: true }).waitFor()
    assert.equal(await page.locator('footer [aria-label="نصب کوکافه"]').count(), 0, 'no duplicate CTA on install guide')
  }
  await page.close()
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
  console.log(`Homepage visual QA: ${results.length} viewport/theme cases, images/SEO/overflow passed${before ? '' : '; card links and install guide passed'}`)
} finally { await browser.close() }
