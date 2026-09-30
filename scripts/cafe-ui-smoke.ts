import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { eq } from 'drizzle-orm'
import { chromium, type Page } from 'playwright'
import { closeDb, getDb } from '../src/db/connection'
import { media, place, placePhoto } from '../src/db/schema'

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
const db = getDb()
const slug = `gallery-ui-smoke-${Date.now()}`
let fixtureId: number | null = null
await mkdir('var/qa/phase4', { recursive: true })

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
  const width = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(width.scroll <= width.client + 1, `${label}: overflow ${width.scroll}/${width.client}`)
}

try {
  const mediaRows = await db.select({ id: media.id }).from(media).where(eq(media.status, 'ok')).limit(2)
  assert.equal(mediaRows.length, 2, 'دو رسانه برای تست گالری لازم است')
  const [created] = await db.insert(place).values({
    slug,
    name: 'کافه آزمایشی گالری عمومی',
    nameNormalized: 'کافه آزمایشی گالری عمومی',
    status: 'published',
    source: 'owner',
    coverMediaId: mediaRows[0]!.id,
    logoMediaId: mediaRows[1]!.id,
    address: 'رکورد موقت تست؛ پس از اجرا حذف می‌شود',
  }).$returningId()
  fixtureId = created!.id
  await db.insert(placePhoto).values(mediaRows.map((row, index) => ({
    placeId: fixtureId!,
    mediaId: row.id,
    alt: `تصویر آزمایشی ${index + 1}`,
    sortOrder: index,
    source: 'owner' as const,
  })))

  const browser = await chromium.launch({ headless: true })
  try {
    for (const width of [320, 390, 430]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
      const page = await context.newPage()
      const errors = observe(page)
      await page.goto(`${base}/cafe/ramouz-cafe`, { waitUntil: 'domcontentloaded' })
      await noOverflow(page, `cafe mobile ${width}`)
      await page.getByRole('heading', { level: 1, name: 'کافه راموز' }).waitFor()
      await page.getByText('شعبهٔ قاضی طباطبایی', { exact: true }).waitFor()
      assert.equal(await page.getByRole('region', { name: /تصاویر محیط/ }).count(), 0, 'لوگو نباید گالری محیط جا زده شود')
      assert.ok(await page.getByRole('button',{name:'مقایسهٔ قیمت',exact:true}).count() > 0)
      // تعداد نظر زنده است و با ثبت نظر واقعی تغییر می‌کند؛ smoke باید منطق
      // «نمونهٔ کم‌تعداد» را بسنجد، نه عدد تاریخی یک رکورد را.
      assert.ok(await page.getByText(/امتیاز اولیه/).count() > 0)

      if (width === 390) {
        await page.getByRole('navigation', { name: 'دسترسی سریع موبایل' }).getByRole('link', { name: 'منو' }).click()
        const dialog = page.getByRole('dialog', { name: /منوی کافه راموز/ })
        await dialog.waitFor()
        assert.match(page.url(), /menu=1/)
        const categories = dialog.getByRole('navigation', { name: 'دسته‌های منو' })
        assert.equal(await categories.getByRole('button').count(), 24)
        assert.equal((await categories.innerText()).includes('شعبه قاضی'), false)
        assert.ok((await categories.innerText()).includes('اضافات / Extras'))

        const search = dialog.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' })
        await search.fill('لاته')
        await dialog.getByText('نتیجهٔ جست‌وجو در تمام منو').waitFor()
        assert.match(page.url(), /menu_q=/)
        await search.fill('')

        const before = await categories.locator('button[aria-pressed="true"]').innerText()
        const results = dialog.locator('[class*="results"]').first()
        await results.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, clientX: 90, clientY: 380 })
        await results.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, clientX: 190, clientY: 384 })
        await page.waitForTimeout(250)
        assert.notEqual(await categories.locator('button[aria-pressed="true"]').innerText(), before, 'Swipe باید دسته را تغییر دهد')

        const sectionUrl = page.url()
        await dialog.locator('a[href^="/item/"]').first().click()
        await page.waitForURL(/\/item\//)
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await dialog.waitFor()
        assert.equal(page.url(), sectionUrl, 'Back باید دسته و حالت باز منو را حفظ کند')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('menu'))
        assert.equal(new URL(page.url()).searchParams.has('menu'), false)
        await page.screenshot({ path: 'var/qa/phase4/ramouz-mobile.png', fullPage: true })
      }
      assert.deepEqual(errors, [])
      await context.close()
    }

    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
      const page = await context.newPage()
      const errors = observe(page)
      await page.goto(`${base}/cafe/ramouz-cafe`, { waitUntil: 'domcontentloaded' })
      await noOverflow(page, 'cafe desktop')
      const categoryButtons = page.getByRole('navigation', { name: 'دسته‌های منو' }).getByRole('button')
      const boxes = await categoryButtons.evaluateAll((buttons) => buttons.map((button) => {
        const box = button.getBoundingClientRect()
        return { top: box.top, bottom: box.bottom }
      }))
      for (let index = 1; index < boxes.length; index++) assert.ok(boxes[index]!.top >= boxes[index - 1]!.bottom - 1, 'دسته‌های دسکتاپ نباید overlap داشته باشند')
      const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent()
      const schema = JSON.parse(jsonLd ?? '{}')
      assert.ok(Number(schema.aggregateRating.ratingValue)>0 && Number(schema.aggregateRating.ratingValue)<=5)
      assert.equal(JSON.stringify(schema.hasMenu).includes('شعبه قاضی'), false)
      assert.deepEqual(errors, [])
      await page.screenshot({ path: 'var/qa/phase4/ramouz-desktop.png', fullPage: false })
      await context.close()
    }

    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'fa-IR' })
      const page = await context.newPage()
      const errors = observe(page)
      await page.goto(`${base}/cafe/${slug}`, { waitUntil: 'domcontentloaded' })
      const gallery = page.getByRole('region', { name: /تصاویر محیط/ })
      await gallery.getByRole('link', { name: /بازکردن گالری/ }).click()
      const dialog = page.getByRole('dialog', { name: /گالری/ })
      await dialog.waitFor()
      assert.match(page.url(), /gallery=1/)
      await dialog.getByRole('button', { name: 'تصویر بعدی' }).click()
      await dialog.getByText('۲ از ۲').waitFor()
      await page.goBack()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      assert.deepEqual(errors, [])
      await context.close()
    }
  } finally {
    await browser.close()
  }

  console.log('✓ قالب کافه: موبایل، منو، Swipe، Back، قیمت، SEO، دسکتاپ و گالری سالم‌اند')
} finally {
  if (fixtureId) await db.delete(place).where(eq(place.id, fixtureId))
  await closeDb()
}
