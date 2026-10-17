/** Read-only browser QA for the mobile experience-hub CTA. Analytics are intercepted. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import { paths } from '../src/routes'

const origin = (process.argv[2] ?? 'http://127.0.0.1:3208').replace(/\/$/, '')
const output = process.env.HOME_EXPERIENCE_QA_OUTPUT ?? 'docs/qa/home-experience-cta'
const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results: unknown[] = []
try {
  for (const viewport of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      const page = await browser.newPage({ viewport, locale: 'fa-IR', reducedMotion: 'reduce', serviceWorkers: 'block' })
      await page.route('**/api/track**', route => route.fulfill({ status: 204 }))
      await page.route('**/api/experience-track**', route => route.fulfill({ status: 204 }))
      await page.route('**/api/discovery-track**', route => route.fulfill({ status: 204 }))
      await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 })
      assert.equal(response?.status(), 200)
      await page.evaluate(() => document.fonts.ready)

      const section = page.locator('section[aria-labelledby="experience-title"]')
      const cta = section.locator('a[class*="experienceAllLink"]')
      const headerLink = section.locator('a[class*="experienceHeaderLink"]')
      const rail = section.locator('[class*="experienceRail"]')
      await section.waitFor()
      assert.equal(await headerLink.isVisible(), false, 'header link is hidden on mobile')
      assert.equal(await cta.isVisible(), true)
      assert.equal(await cta.getAttribute('href'), paths.experienceHub)
      assert.equal(await cta.getAttribute('aria-label'), null, 'visible text supplies the accessible name')
      assert.equal(await cta.innerText(), 'مشاهده همه تجربه‌ها')

      const initialScrollLeft = await rail.evaluate(element => element.scrollLeft)
      await cta.scrollIntoViewIfNeeded()
      await page.waitForTimeout(100)
      const geometry = await page.evaluate(() => {
        const section = document.querySelector<HTMLElement>('section[aria-labelledby="experience-title"]')!
        const rail = section.querySelector<HTMLElement>('[class*="experienceRail"]')!
        const cta = section.querySelector<HTMLAnchorElement>('a[class*="experienceAllLink"]')!
        const nav = document.querySelector<HTMLElement>('nav[aria-label="دسترسی سریع موبایل"]')!
        const cards = [...rail.querySelectorAll<HTMLElement>('a[class*="experienceCard"]')]
        const box = cta.getBoundingClientRect()
        const railBox = rail.getBoundingClientRect()
        const second = cards[1]?.getBoundingClientRect()
        const nextCardVisibleWidth = second ? Math.max(0, Math.min(second.right, railBox.right) - Math.max(second.left, railBox.left)) : 0
        return {
          cta: { x: box.x, y: box.y, width: box.width, height: box.height, bottom: box.bottom },
          sectionContentWidth: section.getBoundingClientRect().width - parseFloat(getComputedStyle(section).paddingLeft) - parseFloat(getComputedStyle(section).paddingRight),
          navTop: nav.getBoundingClientRect().top,
          railScrollLeft: rail.scrollLeft,
          outsideRail: cta.parentElement === section && cta.previousElementSibling === rail,
          nextCardVisibleWidth,
          nextCardWidth: second?.width ?? 0,
          documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          borderWidth: getComputedStyle(cta).borderTopWidth,
        }
      })
      assert.equal(geometry.outsideRail, true, 'CTA must be after, not inside, the horizontal rail')
      assert.ok(geometry.cta.width >= geometry.sectionContentWidth - 2, 'CTA fills section content width')
      assert.ok(geometry.cta.height >= 48, 'CTA touch target is at least 48px')
      assert.ok(geometry.cta.bottom < geometry.navTop - 4, 'CTA is not covered by bottom navigation')
      assert.equal(geometry.railScrollLeft, initialScrollLeft, 'CTA is visible without swiping cards')
      assert.ok(geometry.nextCardVisibleWidth > 10 && geometry.nextCardVisibleWidth < geometry.nextCardWidth - 10, 'next card remains partially visible')
      assert.equal(geometry.documentOverflow, false)
      assert.equal(geometry.borderWidth, '1px')
      assert.deepEqual(errors, [])
      await page.screenshot({ path: `${output}/mobile-${viewport.width}-${theme}.png` })
      if (viewport.width === 390 && theme === 'dark') {
        await cta.click()
        await page.waitForURL(url => url.pathname === paths.experienceHub)
      }
      results.push({ viewport, theme, ...geometry, browserErrors: errors.length })
      await page.close()
    }
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'fa-IR', serviceWorkers: 'block' })
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  const desktopSection = page.locator('section[aria-labelledby="experience-title"]')
  assert.equal(await desktopSection.locator('a[class*="experienceHeaderLink"]').isVisible(), true)
  assert.equal(await desktopSection.locator('a[class*="experienceAllLink"]').isVisible(), false)
  await desktopSection.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${output}/desktop-1440.png` })
  await page.close()

  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
  console.log(`PASS experience CTA: ${results.length} mobile theme/viewport cases and desktop`)
} finally {
  await browser.close()
}
