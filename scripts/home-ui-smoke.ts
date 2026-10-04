import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
await mkdir('var/qa/phase5', { recursive: true })

function observe(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? ''
    if (!reason.includes('ERR_ABORTED')) errors.push(`request: ${request.url()} — ${reason}`)
  })
  return errors
}

async function assertNoOverflow(page: Page, label: string) {
  const width = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert.ok(width.scroll <= width.client + 1, `${label}: overflow ${width.scroll}/${width.client}`)
}

const browser = await chromium.launch({ headless: true })
try {
  for (const width of [320, 360, 390, 430]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: 'fa-IR',
      timezoneId: 'Asia/Tehran',
    })
    const page = await context.newPage()
    const errors = observe(page)
    await page.goto(base, { waitUntil: 'domcontentloaded' })

    await page.getByRole('heading', { level: 1, name: /کافه‌ای پیدا کن/ }).waitFor()
    await assertNoOverflow(page, `home mobile ${width}`)
    assert.equal(await page.locator('main > [class*="home"] main section').count(), 0)
    await page.getByRole('heading', { name: 'اول غذا را انتخاب کن، بعد کافه را' }).waitFor()
    assert.ok(await page.locator('a[href="/for-cafes"]').count() > 0)
    assert.equal(await page.getByText('ساختهٔ جوون‌های مشهد').count(), 0)
    assert.equal(await page.locator('img[src*="green-interior"]').count(), 0)
    assert.ok(await page.locator('img[src="/brand/app-icon-192.png"]').count() >= 2)

    const search = page.getByRole('search').first()
    const input = search.getByRole('searchbox', { name: 'جست‌وجوی کافه، منو و محله' })
    await input.fill('پاستا')
    await search.getByRole('button', { name: 'پیدا کن' }).click()
    await page.waitForURL(/\/search\?q=%D9%BE%D8%A7%D8%B3%D8%AA%D8%A7/)
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { level: 1, name: /کافه‌ای پیدا کن/ }).waitFor()

    const shortcutHeights = await page.locator('[aria-label="شروع سریع"] a').evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    )
    assert.ok(shortcutHeights.every((height) => height >= 44), `touch targets mobile ${width}`)
    assert.deepEqual(errors, [])
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' })
  const page = await context.newPage()
  const errors = observe(page)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await assertNoOverflow(page, 'home desktop')
  await page.getByRole('heading', { name: 'اول غذا را انتخاب کن، بعد کافه را' }).waitFor()
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).waitFor()
  await page.getByRole('heading', { name: 'منوی دیجیتال، فقط یک QR نیست.' }).waitFor()
  const naturalWidth = await page.locator('header img[src="/brand/app-icon-192.png"]').evaluate((image) =>
    (image as HTMLImageElement).naturalWidth,
  )
  assert.equal(naturalWidth, 192)
  assert.deepEqual(errors, [])
  await context.close()
} finally {
  await browser.close()
}

console.log('✓ صفحهٔ اصلی: هویت برند، جست‌وجو، موبایل ۳۲۰ تا ۴۳۰، دسکتاپ و خطاهای Runtime سالم‌اند')
