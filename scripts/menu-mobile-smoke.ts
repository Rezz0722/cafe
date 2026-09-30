import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, type CDPSession, type Page } from 'playwright'

// Read-only UI regression: real catalog, no fixtures or database mutations.
const base = process.argv[2] ?? 'http://127.0.0.1:3010'
const output = 'var/qa/menu-mobile'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const report: object[] = []

async function touchPan(page: Page, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  // dispatchTouchEvent exercises actual pointer cancellation and native panning.
  // synthesizeScrollGesture does not reliably pan this emulated touch context.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
  for (let step = 1; step <= 20; step++) {
    const point = { x: from.x + (to.x - from.x) * step / 20, y: from.y + (to.y - from.y) * step / 20 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(250)
}

function metricDelta(before: { metrics: { name: string; value: number }[] }, after: { metrics: { name: string; value: number }[] }) {
  return Object.fromEntries(after.metrics.filter(m => ['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration'].includes(m.name)).map(m => [m.name, m.value - before.metrics.find(b => b.name === m.name)!.value]))
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[class*="categoryGrid"]')!
    const cards = Array.from(grid.querySelectorAll('button'))
    const box = cards[0]!.getBoundingClientRect()
    const second = cards[1]!.getBoundingClientRect()
    return {
      viewport: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth,
      gridOverflow: grid.scrollWidth > grid.clientWidth,
      scrollHeight: grid.scrollHeight,
      gridHeight: grid.clientHeight,
      firstCard: { width: box.width, height: box.height },
      contentsFit: cards.every(card => {
        const cardBox = card.getBoundingClientRect()
        return ['picture', 'strong', 'small'].every(selector => {
          const child = card.querySelector(selector)!.getBoundingClientRect()
          return child.left >= cardBox.left && child.right <= cardBox.right && child.bottom <= cardBox.bottom
        })
      }),
      twoColumns: Math.abs(box.top - second.top) < 1 && Math.abs(box.left - second.left) > 10,
      ratios: cards.map(card => {
        const rect = card.querySelector('picture')!.getBoundingClientRect()
        return rect.width / rect.height
      }),
      blurLayers: Array.from(grid.querySelectorAll('*')).filter(el => {
        const css = getComputedStyle(el)
        return css.display !== 'none' && css.backdropFilter !== 'none'
      }).length,
      images: Array.from(grid.querySelectorAll('img')).slice(0, 3).map(img => ({
        source: img.currentSrc, naturalWidth: img.naturalWidth, renderedWidth: img.clientWidth,
      })),
    }
  })
}

try {
  for (const width of [320, 360, 390, 430, 768, 1440]) {
    const mobile = width <= 430
    const context = await browser.newContext({
      viewport: { width, height: 844 }, isMobile: mobile, hasTouch: mobile,
      deviceScaleFactor: mobile ? 3 : 1, locale: 'fa-IR', reducedMotion: 'reduce',
      serviceWorkers: 'block',
    })
    // Opening a public menu must not add test visits to analytics.
    await context.route('**/api/track', route => route.fulfill({ status: 204 }))
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/cafe/ramouz-cafe?menu=1`, { waitUntil: 'networkidle' })
    const picker = page.getByRole('dialog', { name: 'دسته‌بندی‌های منو', exact: true })
    await picker.waitFor()
    const grid = picker.locator('[class*="categoryGrid"]')
    const cards = grid.getByRole('button')
    await page.evaluate(() => document.fonts.ready)
    const beforeImages = await cards.first().boundingBox()
    await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLImageElement>('[class*="categoryGrid"] img')).slice(0, 3).every(img => img.complete && img.naturalWidth > 0))
    const initial = await layout(page)
    assert.equal(initial.firstCard.height, beforeImages?.height, `decoding images does not resize cards at ${width}`)
    assert.equal(initial.twoColumns, true, `two columns at ${width}`)
    assert.equal(initial.overflow || initial.gridOverflow, false, `no horizontal overflow at ${width}`)
    if (mobile) {
      assert.ok(initial.firstCard.height > 140 && initial.firstCard.height < 300, `compact cards at ${width}`)
      assert.equal(initial.contentsFit, true, `images, titles and counts fit inside cards at ${width}`)
      assert.ok(initial.ratios.every(ratio => Math.abs(ratio - 1) < .02), `square image ratio at ${width}`)
      assert.equal(initial.blurLayers, 0)
    }
    const closeBox = await picker.getByRole('button', { name: 'بستن دسته‌بندی‌ها' }).boundingBox()
    assert.ok(closeBox && closeBox.y >= 0 && closeBox.height >= 44)
    await grid.evaluate(el => { el.scrollTop = el.scrollHeight })
    await page.waitForTimeout(100)
    const last = await cards.last().boundingBox()
    assert.ok(last && last.y + last.height <= 844, `last card not clipped at ${width}`)
    await grid.evaluate(el => { el.scrollTop = 0 })
    if (width === 360) {
      await picker.getByRole('button', { name: 'بستن دسته‌بندی‌ها' }).focus()
      await page.keyboard.press('Shift+Tab')
      assert.equal(await cards.last().evaluate(el => el === document.activeElement), true, 'picker traps reverse tab')
      await page.keyboard.press('Tab')
      assert.equal(await picker.getByRole('button', { name: 'بستن دسته‌بندی‌ها' }).evaluate(el => el === document.activeElement), true, 'picker traps forward tab')
      await grid.evaluate(el => { el.scrollTop = 0 })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      const before = await cdp.send('Performance.getMetrics')
      await touchPan(page, cdp, { x: 180, y: 700 }, { x: 180, y: 240 })
      assert.ok(await grid.evaluate(el => el.scrollTop) > 200, 'native vertical pan scrolls category grid')
      assert.equal(new URL(page.url()).searchParams.has('section'), false, 'vertical pan does not select a card')
      report.push({ verticalScrollProfile: metricDelta(before, await cdp.send('Performance.getMetrics')) })
      await page.setViewportSize({ width, height: 520 })
      // Chromium applies dynamic viewport units on the following rendering frame.
      await page.waitForFunction(() => document.querySelector('[aria-labelledby="category-picker-title"]')?.getBoundingClientRect().height === 520)
      assert.equal(Math.round((await picker.boundingBox())!.height), 520, 'picker follows the available viewport height')
      await grid.evaluate(el => { el.scrollTop = el.scrollHeight })
      const resizedLast = await cards.last().boundingBox()
      assert.ok(resizedLast && resizedLast.y + resizedLast.height <= 520)
      await page.setViewportSize({ width, height: 844 })
      await page.waitForFunction(() => document.querySelector('[aria-labelledby="category-picker-title"]')?.getBoundingClientRect().height === 844)
      await grid.evaluate(el => { el.scrollTop = 0 })
      await cdp.detach()
    }
    if (width === 360 || width === 1440) await page.screenshot({ path: `${output}/categories-${width}.png` })

    // A long bilingual category has enough items to exercise pagination.
    const categoryName = await cards.nth(2).getAttribute('title')
    await cards.nth(2).click()
    await picker.waitFor({ state: 'hidden' })
    const menu = page.locator('#menu')
    const rail = menu.getByRole('navigation', { name: 'دسته‌های منو' })
    const head = menu.locator('[class*="resultHead"]')
    await head.getByRole('heading', { name: categoryName!, exact: true }).waitFor()
    const headerBox = await head.boundingBox()
    const firstProduct = await menu.locator('ul[class*="items"] > li').first().boundingBox()
    assert.ok(headerBox && firstProduct)
    if (mobile) {
      assert.ok(headerBox.height < 120, `compact selected header at ${width}`)
      assert.equal(await head.locator('picture').isVisible(), false)
      assert.ok(firstProduct.y < 400, `products visible immediately at ${width}: ${firstProduct.y}`)
      assert.equal(await menu.getByRole('button', { name: 'جست‌وجو در منو', exact: true }).isVisible(), true)
      assert.equal(await menu.getByRole('button', { name: 'نمایش همهٔ دسته‌بندی‌ها', exact: true }).isVisible(), true)
      const railBox = await rail.boundingBox()
      const filtersBox = await menu.locator('[class*="menuViewBar"]').boundingBox()
      assert.ok(railBox && filtersBox && filtersBox.y >= railBox.y + railBox.height, `compact filters follow category cards at ${width}`)
    } else {
      assert.equal(await head.locator('picture').isVisible(), true, 'desktop cover preserved')
      assert.ok(headerBox.height >= 250)
      assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'desktop document unlocked')
    }

    // Search, display modes and item navigation work in both layouts.
    const search = menu.getByRole('searchbox', { name: 'جست‌وجو در تمام منو' })
    await search.fill('لاته')
    await menu.getByText('نتیجهٔ جست‌وجو در تمام منو', { exact: true }).waitFor()
    assert.ok(await menu.locator('ul[class*="items"] > li').count() > 0)
    await search.fill('zzzz-no-menu-result')
    await menu.getByText('چیزی با این نام پیدا نشد', { exact: true }).waitFor()
    await menu.getByRole('button', { name: 'پاک‌کردن جست‌وجو', exact: true }).first().click()
    await menu.getByRole('button', { name: 'ساده', exact: true }).click()
    assert.equal(await menu.getByRole('button', { name: 'ساده', exact: true }).getAttribute('aria-pressed'), 'true')
    await menu.getByRole('button', { name: 'تصویری', exact: true }).click()
    const count = await menu.locator('ul[class*="items"] > li').count()
    await menu.getByRole('button', { name: /نمایش .* مورد دیگر/ }).click()
    assert.ok(await menu.locator('ul[class*="items"] > li').count() > count)

    await menu.getByRole('button', { name: /^همهٔ دسته‌بندی‌ها/ }).click()
    await picker.getByRole('button', { name: 'بستن دسته‌بندی‌ها' }).click()
    assert.equal(await menu.getByRole('button', { name: /^همهٔ دسته‌بندی‌ها/ }).evaluate(el => el === document.activeElement), true)

    if (width === 360) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Performance.enable')
      const before = await cdp.send('Performance.getMetrics')
      const beforeSection = new URL(page.url()).searchParams.get('section')
      const beforeScroll = await rail.evaluate(el => el.scrollLeft)
      const bounds = await rail.boundingBox()
      assert.ok(bounds)
      const y = Math.round(bounds.y + bounds.height / 2)
      await touchPan(page, cdp, { x: 80, y }, { x: 280, y })
      assert.notEqual(await rail.evaluate(el => el.scrollLeft), beforeScroll, 'native horizontal swipe scrolls the rail')
      assert.equal(new URL(page.url()).searchParams.get('section'), beforeSection, 'swipe does not select')
      const after = await cdp.send('Performance.getMetrics')
      report.push({ horizontalScrollProfile: metricDelta(before, after) })
      const panelBody = menu.locator('[class*="panelBody"]')
      await touchPan(page, cdp, { x: 180, y }, { x: 180, y: y - 130 })
      assert.ok(await panelBody.evaluate(el => el.scrollTop) > 60, 'vertical swipe starting on rail still scrolls products')
      assert.equal(new URL(page.url()).searchParams.get('section'), beforeSection)

      // Tap after a native pan still selects; keyboard is not mistaken for a drag.
      await rail.getByRole('button').nth(5).click()
      await page.waitForTimeout(100)
      const selectedBox = await rail.locator('[aria-pressed="true"]').boundingBox()
      assert.ok(selectedBox && selectedBox.x >= 0 && selectedBox.x + selectedBox.width <= width)
      await rail.getByRole('button').nth(6).focus()
      await page.keyboard.press('Enter')
      assert.equal(await rail.getByRole('button').nth(6).getAttribute('aria-pressed'), 'true')

      const originalPageY = await page.evaluate(() => scrollY)
      await panelBody.evaluate(el => { el.scrollTop = 500 })
      await page.waitForTimeout(100)
      const sticky = await rail.boundingBox()
      assert.ok(sticky && sticky.y >= 50 && sticky.y < 180, 'rail stays usable when scrolling products')
      assert.equal(await page.evaluate(() => scrollY), originalPageY, 'outer page stays still')
      await rail.getByRole('button').nth(1).click()
      await page.waitForTimeout(100)
      assert.equal(await panelBody.evaluate(el => el.scrollTop), 0, 'new category starts at products')
      await page.screenshot({ path: `${output}/products-${width}.png` })

      const imageButton = menu.getByRole('button', { name: /^بزرگ‌کردن تصویر/ }).first()
      await imageButton.click()
      await page.getByRole('button', { name: 'بستن تصویر', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'بستن تصویر', exact: true }).waitFor({ state: 'hidden' })
      assert.equal(await imageButton.evaluate(el => el === document.activeElement), true, 'image dialog returns focus to thumbnail')
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'closing inner dialog keeps menu scroll lock')

      // Rotating/resizing across the breakpoint must not leave desktop locked.
      await menu.getByRole('button', { name: 'ساده', exact: true }).click()
      await page.setViewportSize({ width: 900, height: 520 })
      await page.waitForFunction(() => document.body.style.overflow === '')
      await page.setViewportSize({ width, height: 844 })
      await page.waitForFunction(() => document.body.style.overflow === 'hidden')
      assert.equal(await menu.getByRole('button', { name: 'ساده', exact: true }).getAttribute('aria-pressed'), 'true', 'resizing preserves display mode')
      await menu.getByRole('button', { name: 'تصویری', exact: true }).click()

      const sectionUrl = page.url()
      await menu.locator('a[href^="/item/"]').first().click()
      await page.waitForURL(/\/item\//)
      await page.goBack({ waitUntil: 'networkidle' })
      assert.equal(page.url(), sectionUrl, 'browser Back restores category URL')
      await menu.getByRole('button', { name: 'بستن منو', exact: true }).waitFor()
      assert.equal(await rail.getByRole('button').nth(1).getAttribute('aria-pressed'), 'true')
      await page.keyboard.press('Escape')
      assert.equal(await page.evaluate(() => document.body.style.overflow), '')
      assert.equal(new URL(page.url()).searchParams.has('menu'), false)
      await menu.locator('[data-menu-launcher]').click()
      await picker.waitFor()
      await page.goBack()
      await picker.waitFor({ state: 'hidden' })
      assert.equal(await page.evaluate(() => document.documentElement.style.overflow), '')
    }
    assert.deepEqual(errors, [], `no JS errors at ${width}`)
    report.push({ width, initial, selectedHeaderHeight: headerBox.height, firstProductTop: firstProduct.y })
    console.log(`PASS: layout and interactions at ${width}px`)
    await context.close()
  }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  console.log('PASS: mobile menu layout, native swipe, search, pagination, display modes, focus, detail/Back and desktop/tablet.')
} finally {
  await browser.close()
}
