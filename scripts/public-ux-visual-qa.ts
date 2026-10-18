/** Read-only visual baseline and route smoke. No analytics requests reach Production. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'https://kucafe.ir').replace(/\/$/, '')
const output = process.argv[3] ?? 'var/qa/public-ux'
const sweep = process.argv[4] === 'all'
const routes = sweep ? [
  { key: 'home', path: '/' },
  { key: 'search', path: '/search' },
  { key: 'search-items', path: '/search?scope=items&q=%D9%82%D9%87%D9%88%D9%87' },
  { key: 'map', path: '/search?view=map' },
  { key: 'cafe', path: '/cafe/raam-cafe' },
  { key: 'menu', path: '/cafe/raam-cafe?menu=1' },
  { key: 'reviews', path: '/cafe/raam-cafe#reviews' },
  { key: 'experiences', path: '/mashhad/experience' },
  { key: 'experience-detail', path: '/mashhad/experience/work' },
  { key: 'food', path: '/mashhad/menu' },
  { key: 'food-category', path: '/mashhad/menu/coffee' },
  { key: 'events', path: '/events' },
  { key: 'booking-entry', path: '/cafe/raam-cafe/request' },
  { key: 'profile', path: '/profile' },
] : [
  { key: 'home', path: '/' },
  { key: 'search', path: '/search' },
]
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results: Array<Record<string, unknown>> = []
try {
  for (const route of routes) {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const page = await browser.newPage({ viewport, locale: 'fa-IR', reducedMotion: 'reduce', serviceWorkers: 'block' })
        for (const endpoint of ['track', 'experience-track', 'discovery-track']) {
          await page.route(`**/api/${endpoint}**`, request => request.fulfill({ status: 204 }))
        }
        await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
        const errors: string[] = []
        page.on('pageerror', error => errors.push(error.message))
        const response = await page.goto(`${origin}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await page.evaluate(() => document.fonts.ready)
        const metrics = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          bodyHeight: document.body.scrollHeight,
          title: document.title,
          hasMain: Boolean(document.querySelector('main')),
        }))
        const filename = `${route.key}-${viewport.width}-${theme}.jpg`
        if (!sweep || (viewport.width === 390 && theme === 'dark') || (viewport.width === 1440 && theme === 'light')) {
          await page.screenshot({ path: `${output}/${filename}`, type: 'jpeg', quality: 84, fullPage: !sweep })
        }
        results.push({ route: route.key, path: route.path, viewport, theme, status: response?.status(), finalPath: new URL(page.url()).pathname, ...metrics, errors })
        assert.ok(response && response.status() < 400, `${route.key} returned ${response?.status()}`)
        await page.close()
      }
    }
  }
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
  const failed = results.filter(result => Number(result.scrollWidth) > Number(result.width) + 1 || (result.errors as string[]).length > 0)
  console.log(`Public UX QA: ${results.length} route/viewport/theme visits, ${failed.length} overflow or page-error cases`)
  if (failed.length) console.log(failed.map(({ route, viewport, theme, scrollWidth, width, errors }) => ({ route, viewport, theme, scrollWidth, width, errors })))
} finally {
  await browser.close()
}
