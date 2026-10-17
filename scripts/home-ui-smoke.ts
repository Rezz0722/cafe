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
    await page.route('**/api/track**', route => route.fulfill({ status: 204 }))
    await page.route('**/api/experience-track**', route => route.fulfill({ status: 204 }))
    await page.route('**/api/discovery-track**', route => route.fulfill({ status: 204 }))
    const errors = observe(page)
    await page.goto(base, { waitUntil: 'domcontentloaded' })

    await page.getByRole('heading', { level: 1, name: /امروز کجا بریم/ }).waitFor()
    await assertNoOverflow(page, `home mobile ${width}`)
    assert.equal(await page.locator('main > [class*="home"] main section').count(), 0)
    await page.getByRole('heading', { name: 'چی برات مهم‌تره؟' }).waitFor()
    await page.getByRole('heading', { name: 'چی بخوریم؟' }).waitFor()
    assert.ok(await page.locator('a[href^="/for-cafes"]').count() > 0)
    assert.equal(await page.getByText('ساختهٔ جوون‌های مشهد').count(), 0)
    assert.equal(await page.locator('img[src*="green-interior"]').count(), 0)
    assert.ok(await page.locator('img[src="/brand/app-icon-192.png"]').count() >= 2)

    const search = page.getByRole('search').first()
    const input = search.getByRole('searchbox', { name: 'کافه، غذا یا محله را جست‌وجو کن' })
    await input.fill('پاستا')
    const searchTarget = await search.evaluate((form) => {
      const node = form as HTMLFormElement
      const params = new URLSearchParams()
      for (const [name, value] of new FormData(node)) {
        if (typeof value === 'string') params.append(name, value)
      }
      return `${node.action}?${params.toString()}`
    })
    assert.match(searchTarget, /\/search\?q=%D9%BE%D8%A7%D8%B3%D8%AA%D8%A7/)

    const shortcutHeights = await page.locator('[aria-label="شروع سریع"] a').evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().height),
    )
    assert.ok(shortcutHeights.every((height) => height >= 44), `touch targets mobile ${width}`)
    assert.deepEqual(errors, [])
    await context.close()
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' })
  const page = await context.newPage()
  await page.route('**/api/track**', route => route.fulfill({ status: 204 }))
  await page.route('**/api/experience-track**', route => route.fulfill({ status: 204 }))
  await page.route('**/api/discovery-track**', route => route.fulfill({ status: 204 }))
  const errors = observe(page)
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  await assertNoOverflow(page, 'home desktop')
  await page.getByRole('heading', { name: 'چی بخوریم؟' }).waitFor()
  await page.getByRole('navigation', { name: 'ناوبری اصلی' }).waitFor()
  await page.getByRole('heading', { name: 'کافه‌دار هستی؟' }).waitFor()
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
