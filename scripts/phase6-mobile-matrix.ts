/** ماتریس نهایی Mobile-first برای مسیرهای حیاتی محصول. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
const routes = [
  '/',
  '/search?q=%D9%BE%D8%A7%D8%B3%D8%AA%D8%A7%20%D8%B1%D8%A7%D9%85%D9%88%D8%B2',
  '/cafe/ramouz-cafe',
  '/item/18734/%D9%BE%DB%8C%D8%AA%D8%B2%D8%A7-%D9%BE%D9%BE%D8%B1%D9%88%D9%86%DB%8C',
  '/auth',
  '/auth/register',
]
const viewports = [
  { label: 'mobile-320', width: 320, height: 844, mobile: true },
  { label: 'mobile-360', width: 360, height: 844, mobile: true },
  { label: 'mobile-375', width: 375, height: 844, mobile: true },
  { label: 'mobile-390', width: 390, height: 844, mobile: true },
  { label: 'mobile-412', width: 412, height: 915, mobile: true },
  { label: 'mobile-430', width: 430, height: 932, mobile: true },
  { label: 'mobile-landscape', width: 844, height: 390, mobile: true },
  { label: 'tablet', width: 768, height: 1024, mobile: false },
  { label: 'desktop', width: 1440, height: 1000, mobile: false },
]

function observe(page: Page): string[] {
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

await mkdir('var/qa/phase6', { recursive: true })
const browser = await chromium.launch({ headless: true })

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: viewport.mobile,
      hasTouch: viewport.mobile,
      locale: 'fa-IR',
      timezoneId: 'Asia/Tehran',
    })
    for (const route of routes) {
      const page = await context.newPage()
      const errors = observe(page)
      const response = await page.goto(base + route, { waitUntil: 'domcontentloaded' })
      assert.equal(response?.status(), 200, `${viewport.label} ${route}: HTTP`)
      await page.locator('main').first().waitFor()
      const size = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }))
      assert.ok(size.scroll <= size.client + 1, `${viewport.label} ${route}: overflow ${size.scroll}/${size.client}`)
      assert.equal(errors.length, 0, `${viewport.label} ${route}: ${errors.join('\n')}`)
      await page.close()
    }
    await context.close()
    console.log(`✓ ${viewport.label}: ${routes.length} مسیر بدون overflow و خطای Runtime`)
  }

  // شبیه‌سازی فضای باقی‌مانده هنگام بازبودن کیبورد موبایل: فیلد فعال باید
  // قابل اسکرول به محدودهٔ دید باشد و زیر کنترل ثابت دفن نشود.
  const keyboardContext = await browser.newContext({
    viewport: { width: 390, height: 500 },
    isMobile: true,
    hasTouch: true,
    locale: 'fa-IR',
  })
  for (const target of [
    { route: '/auth', selector: 'input[name="identifier"]' },
    { route: '/search?q=%D9%BE%D8%A7%D8%B3%D8%AA%D8%A7', selector: 'input[type="search"]' },
  ]) {
    const page = await keyboardContext.newPage()
    await page.goto(base + target.route, { waitUntil: 'domcontentloaded' })
    const field = page.locator(target.selector).first()
    await field.focus()
    await field.scrollIntoViewIfNeeded()
    const rect = await field.evaluate((node) => node.getBoundingClientRect())
    assert.ok(rect.top >= 0 && rect.bottom <= 500, `${target.route}: فیلد زیر فضای کیبورد پنهان شد`)
    await page.close()
  }
  await keyboardContext.close()

  const shotContext = await browser.newContext({ viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR' })
  const shot = await shotContext.newPage()
  await shot.goto(`${base}/auth/register`, { waitUntil: 'networkidle' })
  await shot.screenshot({ path: 'var/qa/phase6/register-mobile-375.png', fullPage: false })
  await shotContext.close()
  console.log('✓ فضای کیبورد، فوکوس و اسکرین‌شات مرجع ثبت‌نام بررسی شد')
} finally {
  await browser.close()
}
