import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const base = (process.argv[2] ?? 'http://127.0.0.1:9098').replace(/\/$/, '')
const output = process.env.QA_OUTPUT_DIR ?? 'var/qa/public-reviews'
const canonicalOrigin = (process.env.QA_CANONICAL_ORIGIN ?? 'https://kucafe.ir').replace(/\/$/, '')
await mkdir(output, { recursive: true })

async function assertNoOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
}

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran',
    colorScheme: 'dark', serviceWorkers: 'block', userAgent: 'KuCafeQA HeadlessChrome',
  })
  await context.route('**/api/**', route => {
    if (/\/api\/[^/]*track/.test(route.request().url())) return route.fulfill({ status: 204 })
    if (!['GET', 'HEAD'].includes(route.request().method())) return route.fulfill({ status: 403 })
    return route.continue()
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base, { waitUntil: 'networkidle' })
  const reviewSection = page.locator('section[aria-labelledby="home-reviews-title"]')
  const allReviews = reviewSection.getByRole('link', { name: 'همهٔ نظرها' })
  assert.equal(await allReviews.getAttribute('href'), '/reviews')
  await reviewSection.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${output}/after-home-dark.png` })
  await allReviews.click()
  await page.waitForURL(`${base}/reviews`)
  await page.getByRole('heading', { level: 1, name: 'نظرهای کافه‌ها و رستوران‌ها' }).waitFor()
  assert.ok(await page.locator('main article').count() > 0)
  assert.ok(await page.locator('main article').count() <= 12)
  assert.ok(await page.getByText('نظر کاربر', { exact: true }).count() > 0)
  console.log('Homepage CTA navigation canonical URLs:', await page.locator('link[rel="canonical"]').evaluateAll(links => links.map(link => link.getAttribute('href'))))
  // Inspect SSR metadata separately from the development router's metadata lifecycle.
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${canonicalOrigin}/reviews`)
  assert.equal(await page.locator('main article img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0).length), 0)
  await assertNoOverflow(page)
  await page.screenshot({ path: `${output}/after-reviews-dark.png` })
  const pagination = page.getByRole('navigation', { name: 'صفحه‌های نتایج' })
  const hasSecondPage = await pagination.count() > 0
  if (hasSecondPage) {
    const firstReview = await page.locator('main article').first().innerText()
    await pagination.getByRole('link', { name: 'صفحه بعد', exact: true }).click()
    await page.waitForURL(`${base}/reviews?page=2#reviews`)
    assert.notEqual(await page.locator('main article').first().innerText(), firstReview)
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${canonicalOrigin}/reviews?page=2`)
    assert.equal(await pagination.locator('[aria-current="page"]').innerText(), '۲')
    await page.screenshot({ path: `${output}/after-reviews-page2-dark.png` })
    await page.reload({ waitUntil: 'networkidle' })
    assert.equal(await pagination.locator('[aria-current="page"]').innerText(), '۲')
  }
  await page.goto(`${base}/reviewed-cafes`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { level: 1, name: 'بررسی کافه‌ها توسط بلاگرها' }).waitFor()
  assert.ok(await page.locator('main a[href="/reviews"]').count() > 0)
  await page.screenshot({ path: `${output}/after-bloggers-dark.png` })
  await page.goto(`${base}/search?view=map`, { waitUntil: 'networkidle' })
  const nav = page.getByRole('navigation', { name: 'دسترسی سریع موبایل' })
  await nav.locator('a[href="/search?view=map"][aria-current="page"]').waitFor()
  assert.equal(await nav.locator('[aria-current="page"]').count(), 1)
  await page.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 60_000 })
  await page.getByText('بارگذاری جزئیات نقشه…', { exact: true }).waitFor({ state: 'hidden', timeout: 60_000 })
  await page.screenshot({ path: `${output}/after-map-dark.png` })
  await nav.getByRole('link', { name: 'کشف', exact: true }).click()
  await page.waitForURL(`${base}/search`)
  await nav.locator('a[href="/search"][aria-current="page"]').waitFor()
  assert.equal(await nav.locator('[aria-current="page"]').count(), 1)
  await page.goto(`${base}/reviews`, { waitUntil: 'networkidle' })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await assertNoOverflow(page)
  await page.screenshot({ path: `${output}/after-reviews-light.png` })
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await assertNoOverflow(page)
    await page.screenshot({ path: `${output}/after-reviews-${width}.png` })
  }
  assert.deepEqual(errors, [])
  await context.close()

  // The list and URL pagination must be present in the server-rendered HTML.
  const noJs = await browser.newContext({ javaScriptEnabled: false, userAgent: 'KuCafeQA HeadlessChrome' })
  const staticPage = await noJs.newPage()
  const staticPath = `/reviews${hasSecondPage ? '?page=2' : ''}`
  await staticPage.goto(`${base}${staticPath}`, { waitUntil: 'domcontentloaded' })
  assert.ok(await staticPage.locator('main article').count() > 0)
  assert.equal(await staticPage.locator('link[rel="canonical"]').getAttribute('href'), `${canonicalOrigin}${staticPath}`)
  await noJs.close()
} finally {
  await browser.close()
}
console.log('✓ Public review CTA, bounded SSR pages, blogger distinction, canonical, mobile map state, and responsive layout passed')
