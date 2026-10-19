/** Non-mutating staged runtime acceptance; analytics and all writes are intercepted. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'https://kucafe.ir').replace(/\/$/, '')
const output = process.argv[3] ?? 'var/qa/public-ux-release'
const stage = process.argv[4] ?? 'final'
const paths = stage === 'reviews' ? ['/', '/reviews', '/reviews?page=2', '/reviewed-cafes', '/search?view=map']
  : stage === 'food' ? ['/', '/mashhad/menu', '/mashhad/menu/coffee', '/mashhad/menu/coffee?page=2', '/cafe/ramouz-cafe?menu=1']
  : stage === 'discovery' ? ['/', '/mashhad/experience', '/mashhad/experience/breakfast', '/mashhad/experience/breakfast?page=2', '/mashhad', '/mashhad/vakilabad', '/mashhad/vakilabad?page=2']
  : ['/', '/reviews', '/mashhad/menu', '/mashhad/menu/coffee', '/mashhad/experience/breakfast', '/mashhad/vakilabad', '/search', '/search?view=map', '/events', '/for-cafes', '/install', '/cafe/ramouz-cafe', '/cafe/jan-boutique-restaurant?menu=1', '/cafe/ramouz-cafe#reviews', '/cafe/ramouz-cafe#map', '/cafe/ramouz-cafe/request', '/profile']
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const results: object[] = []
try {
  for (const theme of ['dark', 'light']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', serviceWorkers: 'block', reducedMotion: 'reduce', extraHTTPHeaders: { DNT: '1' } })
    await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403 }))
    for (const endpoint of ['track', 'experience-track', 'discovery-track']) await context.route(`**/api/${endpoint}**`, route => route.fulfill({ status: 204 }))
    await context.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
    const page = await context.newPage()
    for (const [index, path] of paths.entries()) {
      const errors: string[] = []; const assetErrors: string[] = []
      const onError = (error: Error) => errors.push(error.message)
      const onResponse = (response: import('playwright').Response) => {
        if (/\/_next\/static\//.test(response.url()) && response.status() >= 400) assetErrors.push(`${response.status()} ${new URL(response.url()).pathname}`)
      }
      page.on('pageerror', onError); page.on('response', onResponse)
      const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 60_000 })
      await page.evaluate(() => document.fonts.ready)
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, theme: document.documentElement.dataset.theme,
        heading: document.querySelector('main h1')?.textContent,
        broken: [...document.querySelectorAll<HTMLImageElement>('main img')].filter(img => img.getBoundingClientRect().height > 0 && img.loading !== 'lazy' && img.complete && !img.naturalWidth).length,
      }))
      assert.ok(response && response.status() < 400, `${path}: HTTP ${response?.status()}`)
      assert.ok(metrics.scrollWidth <= metrics.width + 1, `${path}: overflow`)
      assert.equal(metrics.broken, 0, `${path}: visible eager broken image`)
      assert.equal(metrics.theme, theme)
      assert.deepEqual(errors, [], `${path}: runtime errors`)
      assert.deepEqual(assetErrors, [], `${path}: stale/missing JS or CSS`)
      if (path === '/reviews') assert.ok(await page.locator('main article').count() > 0)
      if (path === '/mashhad/menu') assert.equal(await page.getByText('مقایسهٔ مستقیم', { exact: true }).count(), 0)
      if (path === '/search?view=map') await page.getByRole('navigation', { name: 'دسترسی سریع موبایل' }).locator('a[href="/search?view=map"][aria-current="page"]').waitFor()
      if (path.includes('menu=1')) { await page.locator('[data-menu-picker]').waitFor(); assert.equal(await page.getByRole('dialog').count(), 1) }
      if (theme === 'dark') await page.screenshot({ path: `${output}/${stage}-${index}-dark.jpg`, type: 'jpeg', quality: 80 })
      results.push({ path, requestedTheme: theme, status: response.status(), finalPath: new URL(page.url()).pathname, ...metrics, errors, assetErrors })
      page.off('pageerror', onError); page.off('response', onResponse)
    }
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(`PASS ${stage}: ${results.length} live read-only visits, themes, runtime and versioned assets`)
} finally { await browser.close() }
