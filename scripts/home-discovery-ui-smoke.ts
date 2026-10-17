/** Read-only visual QA. Public GETs only; analytics requests are intercepted. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const local = (process.argv[2] ?? 'http://127.0.0.1:3206').replace(/\/$/, '')
const output = 'var/qa/product-discovery'
const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
]

async function blockTracking(page: Page) {
  await page.route('**/api/track**', route => route.fulfill({ status: 204 }))
  await page.route('**/api/experience-track**', route => route.fulfill({ status: 204 }))
  await page.route('**/api/discovery-track**', route => route.fulfill({ status: 204 }))
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('#home-title')?.getBoundingClientRect()
    const search = document.querySelector('#home-search')?.getBoundingClientRect()
    const firstCategory = (document.querySelector('#quick-discovery-title') ?? document.querySelector('#experience-title'))?.getBoundingClientRect()
    const reviews = document.querySelector('#home-reviews-title')?.getBoundingClientRect()
    const food = document.querySelector('#discovery-title')?.getBoundingClientRect()
    let brokenVisibleImages = 0
    for (const img of document.images) {
      const rect = img.getBoundingClientRect()
      if (rect.top < innerHeight && rect.bottom > 0 && img.complete && img.naturalWidth === 0) brokenVisibleImages++
    }
    return {
      viewport: [innerWidth, innerHeight],
      pageHeight: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      sections: document.querySelectorAll('main > section').length,
      title: title ? { top: Math.round(title.top), bottom: Math.round(title.bottom), height: Math.round(title.height) } : null,
      search: search ? { top: Math.round(search.top), bottom: Math.round(search.bottom), height: Math.round(search.height) } : null,
      firstCategory: firstCategory ? { top: Math.round(firstCategory.top), bottom: Math.round(firstCategory.bottom), height: Math.round(firstCategory.height) } : null,
      reviews: reviews ? { top: Math.round(reviews.top), bottom: Math.round(reviews.bottom), height: Math.round(reviews.height) } : null,
      food: food ? { top: Math.round(food.top), bottom: Math.round(food.bottom), height: Math.round(food.height) } : null,
      brokenVisibleImages,
    }
  })
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const report: unknown[] = []
try {
  for (const viewport of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport, locale: 'fa-IR', reducedMotion: 'reduce', serviceWorkers: 'block' })
      await blockTracking(page)
      await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const response = await page.goto(`${local}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      assert.equal(response?.status(), 200)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(300)
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'theme must remain stable after hydration')
      const measured = await geometry(page)
      assert.equal(measured.overflow, false, `${viewport.width} ${theme}: horizontal overflow`)
      assert.equal(measured.brokenVisibleImages, 0, `${viewport.width} ${theme}: visible broken image`)
      assert.ok(measured.search && measured.firstCategory, `${viewport.width} ${theme}: discovery entry missing`)
      if (viewport.width === 390) {
        assert.ok(measured.firstCategory.top < 844, `390 first category starts below fold: ${measured.firstCategory.top}`)
        assert.ok(measured.search.bottom < measured.firstCategory.top, 'search precedes discovery')
      }
      assert.deepEqual(errors, [], `${viewport.width} ${theme}: browser errors`)
      await page.screenshot({ path: `${output}/home-after-${viewport.width}-${theme}.png`, fullPage: true })
      if (viewport.width === 390) await page.screenshot({ path: `${output}/first-fold-after-390-${theme}.png` })
      report.push({ source: 'local', theme, ...measured })
      await page.close()
    }
  }

  for (const theme of ['light', 'dark'] as const) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', reducedMotion: 'reduce', serviceWorkers: 'block' })
    await blockTracking(page)
    await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
    const response = await page.goto('https://kucafe.ir/', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    assert.equal(response?.status(), 200)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme, 'production theme must remain stable after hydration')
    const measured = await geometry(page)
    await page.screenshot({ path: `${output}/home-before-390-${theme}.png`, fullPage: true })
    await page.screenshot({ path: `${output}/first-fold-before-390-${theme}.png` })
    report.push({ source: 'production-read-only', theme, ...measured })
    await page.close()
  }
  await writeFile(`${output}/metrics.json`, JSON.stringify(report, null, 2))
  console.log(`PASS home-discovery visual QA: ${viewports.length * 2} local viewports + 2 read-only baseline; ${output}`)
} finally {
  await browser.close()
}
