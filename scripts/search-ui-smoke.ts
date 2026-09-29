import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type BrowserContext, type Page } from 'playwright'

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
await mkdir('var/qa/phase3', { recursive: true })

const browser = await chromium.launch({ headless: true, timeout: 15_000 })

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

async function noOverflow(page: Page, label: string) {
  const size = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  assert.ok(size.scroll <= size.client + 1, `${label}: overflow ${size.scroll}/${size.client}`)
}

async function newMobile(options: Parameters<typeof browser.newContext>[0] = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    isMobile: true,
    hasTouch: true,
    ...options,
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  page.setDefaultNavigationTimeout(30_000)
  return { context, page, errors: observe(page) }
}

async function close(context: BrowserContext) {
  await context.close()
}

try {
  // Drawer و رد مجوز موقعیت
  {
    const { context, page, errors } = await newMobile({ permissions: [] })
    await page.goto(`${base}/search?scope=places`, { waitUntil: 'domcontentloaded' })
    assert.equal(await page.locator('a[href^="/cafe/"]').count(), 24)
    await noOverflow(page, 'mobile base')
    await page.getByRole('button', { name: /فیلترها/ }).click()
    const dialog = page.getByRole('dialog', { name: 'فیلترهای جست‌وجو' })
    assert.equal(await dialog.isVisible(), true)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(new URL(page.url()).hash, '', 'فیلتر موبایل نباید hash قفل‌کننده بسازد')
    await page.getByRole('button', { name: 'نزدیک من' }).click()
    await page.getByText(/دسترسی موقعیت در تنظیمات مرورگر بسته است/).waitFor()
    assert.equal(new URL(page.url()).searchParams.has('near'), false)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: 'var/qa/phase3/search-mobile-location-denied.png' })
    await close(context)
  }

  // موقعیت معتبر، مرتب‌سازی کل نتایج و Pagination
  {
    const { context, page, errors } = await newMobile({
      permissions: ['geolocation'],
      geolocation: { latitude: 36.31, longitude: 59.55 },
    })
    await page.goto(`${base}/search?scope=places`, { waitUntil: 'domcontentloaded' })
    await page.locator('select[name="sort"]').selectOption('distance')
    await page.waitForURL(/near=1/)
    const firstPage = page.locator('a[href^="/cafe/"]')
    assert.equal(await firstPage.count(), 24, 'نزدیک‌ترین باید پس از sort صفحه‌بندی شود')
    assert.match(await firstPage.first().innerText(), /متر|کیلومتر/)
    const firstHref = await firstPage.first().getAttribute('href')
    await page.getByRole('button', { name: 'بعدی' }).click()
    await page.waitForURL(/page=2/)
    assert.equal(await page.locator('a[href^="/cafe/"]').count(), 24)
    assert.notEqual(await page.locator('a[href^="/cafe/"]').first().getAttribute('href'), firstHref)
    // حرکت واقعی کاربر را شبیه‌سازی می‌کنیم؛ scrollTo اسکریپتی می‌تواند با
    // restoration خود مرورگر رقابت کند و رفتار لمسی را نمایندگی نمی‌کند.
    await page.mouse.wheel(0, 620)
    await page.waitForTimeout(220)
    await page.locator('a[href^="/cafe/"]').first().click()
    await page.waitForURL(/\/cafe\//)
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page.waitForURL(/\/search.*page=2/)
    await page.waitForTimeout(850)
    assert.ok(await page.evaluate(() => window.scrollY > 300), 'Back باید موقعیت اسکرول نتایج را حفظ کند')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: 'var/qa/phase3/search-mobile-nearest-page2.png', fullPage: false })
    await close(context)
  }

  // فیلتر قیمت، چیپ‌های فعال، جست‌وجوی دارای غلط و autocomplete محدود
  {
    const { context, page, errors } = await newMobile()
    await page.goto(`${base}/search?scope=places&max=200000&d=sajad`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('فیلترهای فعال').waitFor()
    assert.equal(await page.getByText('قیمت ثبت نشده').count(), 0)
    await page.goto(`${base}/search?q=${encodeURIComponent('پاستاا')}`, { waitUntil: 'domcontentloaded' })
    assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /پاستا/)
    const input = page.getByRole('combobox', { name: 'جست‌وجوی کافه یا آیتم منو' })
    await input.fill('لاته')
    const suggestions = page.locator('#search-suggestions')
    await suggestions.waitFor()
    const box = await suggestions.boundingBox()
    assert.ok(box && box.height <= 320, `پیشنهاد موبایل بیش از حد بلند است: ${box?.height}`)
    await page.goto(`${base}/search?scope=places&q=${encodeURIComponent('پاپیلونن')}`, { waitUntil: 'domcontentloaded' })
    await page.getByText(/نزدیک‌ترین نام‌های معتبر/).waitFor()
    assert.ok(await page.locator('a[href^="/cafe/"]').count() > 0)
    assert.deepEqual(errors, [])
    await close(context)
  }

  // نقشه باید کل Scope را بشناسد و Marker با کارت انتخابی پیوسته باشد.
  {
    const { context, page, errors } = await newMobile()
    await page.goto(`${base}/search?scope=places&view=map`, { waitUntil: 'domcontentloaded' })
    const note = page.getByText(/نتیجه مختصات معتبر دارند/)
    await note.waitFor()
    assert.match(await note.innerText(), /۲۳۹ از ۳۴۶/)
    const zoomButton = page.getByRole('button', { name: 'بزرگ‌نمایی' })
    const mapFallback = page.getByText('نقشه بار نشد', { exact: true })
    await Promise.race([
      zoomButton.waitFor({ timeout: 25_000 }),
      mapFallback.waitFor({ timeout: 25_000 }),
    ])
    if (await zoomButton.isVisible().catch(() => false)) {
      await zoomButton.click()
      await page.waitForTimeout(500)
      assert.ok(
        await page.evaluate(() => Object.keys(sessionStorage).some((key) => key.startsWith('kucafe:search-map:'))),
        'محدوده و زوم نقشه باید برای بازگشت حفظ شود',
      )
      const marker = page.locator('a.maplibregl-marker').first()
      await marker.waitFor({ timeout: 60_000 })
      await marker.click()
      await page.getByText('انتخاب روی نقشه').waitFor()
      assert.match(page.url(), /view=map/)
    } else {
      // Chromium بعضی سرورهای بدون GPU را بدون WebGL2 اجرا می‌کند. در آن
      // محیط باید fallback روشن و قابل‌فهم بماند؛ مسیر تعاملی در محیط WebGL
      // بالاتر تست می‌شود.
      await page.getByText(/WebGL2 is required/).waitFor()
    }
    await noOverflow(page, 'mobile map')
    assert.deepEqual(errors, [])
    await page.screenshot({ path: 'var/qa/phase3/search-mobile-map-selection.png' })
    await close(context)
  }

  // دسکتاپ: ساختار دو ستونه و سلامت runtime.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    const errors = observe(page)
    await page.goto(`${base}/search?q=${encodeURIComponent('پاستا')}`, { waitUntil: 'domcontentloaded' })
    await noOverflow(page, 'desktop search')
    assert.ok(await page.locator('main, [role="main"]').count() >= 1)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: 'var/qa/phase3/search-desktop-pasta.png', fullPage: false })
    await close(context)
  }

  console.log('✓ Search موبایل و دسکتاپ: فیلتر، موقعیت، sort، pagination، typo و map سالم‌اند')
} finally {
  await browser.close()
}
