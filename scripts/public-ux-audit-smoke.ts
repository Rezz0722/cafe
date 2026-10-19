/** Revisit the independent audit inventory without sending any writes. */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const origin = (process.argv[2] ?? 'http://127.0.0.1:9095').replace(/\/$/, '')
const output = process.argv[3] ?? 'var/qa/public-ux-audit'
const inventory = JSON.parse(await readFile('scripts/public-ux-audit-routes.json', 'utf8')) as { index: number; path: string }[]
const browser = await chromium.launch()
const results: object[] = []
await mkdir(output, { recursive: true })
try {
  for (const { index, path } of [...inventory, { index: 64, path: '/reviews' }]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran', reducedMotion: 'reduce', serviceWorkers: 'block' })
    await page.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 403 }))
    for (const endpoint of ['track', 'experience-track', 'discovery-track']) await page.route(`**/api/${endpoint}**`, route => route.fulfill({ status: 204 }))
    await page.addInitScript(() => localStorage.setItem('kucafe-theme-mode', 'dark'))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(origin + path, { waitUntil: 'networkidle', timeout: 60_000 })
    await page.evaluate(() => document.fonts.ready)
    const visibleImages = page.locator('main img:visible')
    for (const img of await visibleImages.all()) {
      await img.scrollIntoViewIfNeeded()
      await img.evaluate(async node => {
        const image = node as HTMLImageElement
        if (!image.complete) await new Promise(resolve => { image.addEventListener('load', resolve, { once: true }); image.addEventListener('error', resolve, { once: true }); setTimeout(resolve, 6000) })
      })
    }
    const broken = await visibleImages.evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || !(image as HTMLImageElement).naturalWidth).map(image => image.getAttribute('src')))
    const geometry = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))
    assert.ok(response && response.status() < 400, `${index}: ${path} HTTP ${response?.status()}`)
    assert.deepEqual(errors, [], `${index}: browser errors`)
    assert.deepEqual(broken, [], `${index}: broken visible images`)
    assert.ok(geometry.scrollWidth <= geometry.width + 1, `${index}: overflow`)
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0) })
    if ([1, 3, 4, 9, 11, 12, 21, 33, 48, 53, 64].includes(index)) await page.screenshot({ path: `${output}/${index}-390-dark.jpg`, type: 'jpeg', quality: 84, fullPage: !path.includes('menu=1') })
    results.push({ index, path, status: response.status(), finalPath: new URL(page.url()).pathname, ...geometry, visibleImages: await visibleImages.count(), errors, broken })
    console.log(`PASS ${index}: ${path}`)
    await page.close()
  }
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
  console.log(`PASS independent audit revisit: ${results.length} routes`)
} finally { await browser.close() }
