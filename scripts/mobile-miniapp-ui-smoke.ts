/** Read-only browser regression for the public cafe mini app. Never submits a form. */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const base = (process.argv[2] ?? 'http://127.0.0.1:3201').replace(/\/$/, '')
const output = 'var/qa/mobile-miniapp'
const widths = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
  { width: 768, height: 1024 }, { width: 1440, height: 900 },
]

async function ready(page: Page, path = '/cafe/raam-cafe', hydrate = true) {
  const response = await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  if (response) assert.equal(response.status(), 200, path)
  if (hydrate && page.viewportSize()!.width <= 760) {
    await page.locator('#page-top[data-cafe-ready="true"]').waitFor()
  }
  // The development-only Next.js badge overlaps the leftmost bottom tab.
  // Production has no such portal; keep it from intercepting QA taps.
  if (base.includes('127.0.0.1') && await page.locator('nextjs-portal').count()) {
    await page.addStyleTag({ content: 'nextjs-portal { pointer-events: none !important }' })
  }
  if (hydrate) await page.waitForTimeout(280) // hydrated nav state and dialog animation
}

async function noOverflow(page: Page, label: string) {
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  assert.ok(geometry.document <= geometry.width + 1, `${label}: horizontal document overflow ${JSON.stringify(geometry)}`)
  assert.ok(geometry.body <= geometry.width + 1, `${label}: horizontal body overflow ${JSON.stringify(geometry)}`)
}

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
let checks = 0
try {
  for (const viewport of widths) {
    const page = await browser.newPage({ viewport, locale: 'fa-IR' })
    // The local QA server may read the live catalogue. Never write view counters.
    await page.route('**/api/track**', route => route.fulfill({ status: 204, body: '' }))
    await page.route('**/api/experience-track**', route => route.fulfill({ status: 204, body: '' }))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    for (const theme of ['light', 'dark']) {
      await ready(page)
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
      await noOverflow(page, `${viewport.width} overview ${theme}`)
      await page.screenshot({ path: `${output}/overview-${viewport.width}-${theme}.png` })
      checks++
      if (viewport.width <= 760) {
        const nav = page.getByRole('navigation', { name: 'بخش‌های کافه' })
        assert.equal(await nav.isVisible(), true)
        assert.equal(await nav.getByRole('link').count(), 4)
        for (const [name, screen] of [['تجربه‌ها', 'reviews'], ['اطلاعات', 'info']] as const) {
          await nav.getByRole('link', { name }).click()
          assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), screen)
          await noOverflow(page, `${viewport.width} ${screen} ${theme}`)
          await page.screenshot({ path: `${output}/${screen}-${viewport.width}-${theme}.png` })
          checks++
        }
        await nav.getByRole('link', { name: 'منو' }).click()
        await page.getByRole('dialog').waitFor({ state: 'visible' })
        assert.equal(await page.getByRole('dialog').count(), 1, 'menu must be one fullscreen, not nested')
        const picker = page.locator('[data-menu-picker]')
        assert.equal(await picker.isVisible(), true, 'ordinary menu entry starts at categories')
        await page.screenshot({ path: `${output}/categories-${viewport.width}-${theme}.png` })
        await picker.locator('[class*="categoryGrid"]').getByRole('button').first().click()
        await page.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' }).waitFor({ state: 'visible' })
        assert.equal(await page.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' }).isVisible(), true)
        assert.equal(await page.getByRole('button', { name: 'تصویری' }).getAttribute('aria-pressed'), 'true')
        await noOverflow(page, `${viewport.width} menu ${theme}`)
        await page.screenshot({ path: `${output}/menu-${viewport.width}-${theme}.png` })
        checks++
        await page.goBack()
        assert.equal(await picker.isVisible(), true, 'Back from items returns to categories')
        await page.goBack()
        assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'info')
        await page.goForward()
        assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'menu')
        await page.getByRole('button', { name: 'بستن منو', exact: true }).click()
        assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'info')
        checks++
      }
    }
    assert.deepEqual(errors, [], `browser errors at ${viewport.width}`)
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'fa-IR' })
  await page.route('**/api/track**', route => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/experience-track**', route => route.fulfill({ status: 204, body: '' }))
  await ready(page, '/cafe/raam-cafe#reviews')
  assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'reviews')
  assert.equal(await page.getByText('هنوز تجربه‌ای ثبت نشده.').count(), 1)
  assert.equal(await page.getByRole('link', { name: 'ورود و ثبت اولین تجربه' }).count(), 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#page-top[data-cafe-ready="true"]').waitFor()
  assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'reviews')
  await ready(page, '/cafe/raam-cafe#map')
  assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'info')
  await ready(page, '/cafe/raam-cafe?kind=birthday&experience=birthday#reviews')
  await page.getByRole('navigation', { name: 'بخش‌های کافه' }).getByRole('link', { name: 'اطلاعات' }).click()
  assert.equal(new URL(page.url()).searchParams.get('kind'), 'birthday')
  assert.equal(new URL(page.url()).searchParams.get('experience'), 'birthday')
  await ready(page, '/cafe/raam-cafe#menu')
  assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'menu')
  assert.equal(await page.getByRole('dialog').count(), 1)
  const menu = page.getByRole('dialog', { name: /منوی کافه رام/ })
  const categories = menu.locator('[data-menu-picker]')
  assert.equal(await categories.isVisible(), true)
  await categories.getByRole('button', { name: /نوشیدنی‌های گرم بر پایه قهوه/ }).click()
  await menu.getByRole('button', { name: 'ساده', exact: true }).click()
  await menu.getByRole('button', { name: 'نمایش همهٔ دسته‌بندی‌ها' }).click()
  await categories.locator('[class*="categoryGrid"]').getByRole('button').nth(1).click()
  assert.equal(await menu.getByRole('button', { name: 'ساده', exact: true }).getAttribute('aria-pressed'), 'true', 'explicit simple mode survives category change')
  await menu.getByRole('button', { name: 'تصویری', exact: true }).click()
  const search = menu.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' })
  await search.fill('لاته')
  await menu.getByText('نتیجهٔ جست‌وجو در تمام منو').waitFor()
  assert.equal(new URL(page.url()).searchParams.get('menu_q'), 'لاته')
  await search.fill('')
  await menu.getByRole('button', { name: 'نمایش همهٔ دسته‌بندی‌ها' }).click()
  assert.equal(await page.getByRole('dialog').count(), 1)
  await categories.getByRole('button', { name: /نوشیدنی‌های گرم بر پایه قهوه/ }).click()
  assert.ok(new URL(page.url()).searchParams.has('section'))
  const sectionUrl = page.url()
  await menu.locator('a[href^="/item/"]').first().click()
  await page.waitForURL(/\/item\//)
  await page.goBack()
  await menu.waitFor()
  assert.equal(page.url(), sectionUrl, 'Back restores the selected menu category')
  await page.keyboard.press('Escape')
  assert.equal(await categories.isVisible(), true)
  await page.keyboard.press('Escape')
  await menu.waitFor({ state: 'hidden' })
  await ready(page)
  assert.equal(await page.getByRole('link', { name: 'درخواست رزرو میز' }).count(), 0, 'no false booking CTA')
  await page.getByRole('button', { name: 'مقایسه با قیمت شهر' }).click()
  assert.equal(await page.getByRole('dialog', { name: 'قیمت اینجا در مقایسه با شهر' }).isVisible(), true)
  await page.waitForTimeout(280)
  await page.screenshot({ path: `${output}/compare-390-light.png` })
  await page.getByRole('dialog', { name: 'قیمت اینجا در مقایسه با شهر' }).getByRole('button', { name: 'بستن' }).click()
  assert.equal(await page.getByRole('dialog', { name: 'قیمت اینجا در مقایسه با شهر' }).isVisible(), false)
  checks += 16
  await ready(page, '/cafe/ramouz-cafe#reviews')
  assert.equal(await page.locator('#page-top').getAttribute('data-cafe-screen'), 'reviews')
  assert.ok(await page.locator('#reviews li').count() > 0, 'review fixture must contain real reviews')
  await page.screenshot({ path: `${output}/reviews-with-content-390-light.png` })
  checks++
  await page.close()

  const noJs = await browser.newPage({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false })
  await ready(noJs, '/cafe/raam-cafe', false)
  assert.equal(await noJs.locator('[data-menu-content]').isVisible(), true)
  assert.equal(await noJs.locator('#reviews').isVisible(), true)
  assert.equal(await noJs.locator('#map').count(), 1)
  checks++
  await noJs.close()
  console.log(`PASS mobile-miniapp-ui: ${checks} checks; screenshots in ${output}`)
} finally {
  await browser.close()
}
