/** Read-only browser QA against current public data; all analytics POSTs are intercepted. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'http://127.0.0.1:3207').replace(/\/$/, '')
const output = 'var/qa/trusted-reviews'
const sizes = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
]

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results: unknown[] = []
try {
  for (const viewport of sizes) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport, locale: 'fa-IR', reducedMotion: 'reduce', serviceWorkers: 'block' })
      const tracked: unknown[] = []
      await page.route('**/api/track**', route => route.fulfill({ status: 204 }))
      await page.route('**/api/experience-track**', route => route.fulfill({ status: 204 }))
      await page.route('**/api/discovery-track**', async route => {
        tracked.push(JSON.parse(route.request().postData() ?? '{}'))
        await route.fulfill({ status: 204 })
      })
      await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const response = await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      assert.equal(response?.status(), 200)
      await page.waitForLoadState('load')
      await page.waitForTimeout(700)
      const section = page.locator('section[aria-labelledby="home-reviews-title"]')
      await section.waitFor()
      const cards = section.locator('a[data-discovery-event="review_card_opened"]')
      assert.equal(await cards.count(), 3, 'current public dataset has enough approved reviews')
      const details = await page.evaluate(() => {
        const section = document.querySelector('section[aria-labelledby="home-reviews-title"]')!
        return {
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          sectionTop: Math.round(section.getBoundingClientRect().top + scrollY),
          pageHeight: document.documentElement.scrollHeight,
          text: section.textContent ?? '',
          links: [...section.querySelectorAll('a[data-discovery-event="review_card_opened"]')].map(anchor => anchor.getAttribute('href')),
          brokenImages: [...section.querySelectorAll('img')].filter(image => image.complete && image.naturalWidth === 0).length,
        }
      })
      assert.equal(details.overflow, false, `${viewport.width} ${theme}: horizontal overflow`)
      assert.equal(details.brokenImages, 0, `${viewport.width} ${theme}: broken review image`)
      assert.equal(/09\d{9}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(details.text), false, 'contact leaked into excerpt')
      assert.ok(details.links.every(link => link?.endsWith('#reviews')))
      assert.deepEqual(errors, [])
      if (viewport.width === 390 || viewport.width === 1440) {
        await section.screenshot({ path: `${output}/reviews-${viewport.width}-${theme}.png` })
        if (viewport.width === 390) await page.screenshot({ path: `${output}/home-full-${viewport.width}-${theme}.png`, fullPage: true })
      }
      await cards.first().click()
      await page.waitForFunction(() => /\/cafe\/[^/]+#reviews$/.test(location.href), undefined, { timeout: 60_000 })
      await page.waitForTimeout(100)
      assert.equal(tracked.filter(value => typeof value === 'object' && value !== null && (value as { event?: string }).event === 'review_card_opened').length, 1)
      results.push({ viewport, theme, sectionTop: details.sectionTop, pageHeight: details.pageHeight, cards: 3, browserErrors: errors.length })
      await page.close()
    }
  }
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
  console.log(`PASS trusted-review browser QA: ${sizes.length * 2} light/dark viewports; analytics intercepted`)
} finally {
  await browser.close()
}
