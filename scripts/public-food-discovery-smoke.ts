import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:9096')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Run against a local preview only')
const output = 'var/qa/public-food-20261019'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const failures: string[] = []
const measurements: object[] = []

async function inspect(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready)
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  assert.ok(dimensions.scrollWidth <= dimensions.width + 1, `${label}: horizontal overflow`)
  assert.equal(await page.locator('main h1').count(), 1, `${label}: one main heading`)
  await page.locator('main img').evaluateAll(async images => {
    await Promise.all(images.map(image => {
      const element = image as HTMLImageElement
      element.loading = 'eager'
      return element.decode().catch(() => undefined)
    }))
  })
  const broken = await page.locator('main img').evaluateAll(images => images.filter(image => !(image as HTMLImageElement).naturalWidth).map(image => image.getAttribute('src')))
  assert.deepEqual(broken, [], `${label}: broken images`)
  measurements.push({ label, ...dimensions })
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    scrollTo({ top: 0, behavior: 'instant' })
  })
  await page.screenshot({ path: `${output}/${label}.png`, fullPage: true })
}

async function collection(page: Page) {
  return page.locator('main').evaluate(() => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
    return scripts.map(script => JSON.parse(script.textContent ?? '{}')).find(item => item['@type'] === 'CollectionPage')
  })
}

async function cafeLinks(page: Page) {
  return page.locator('#results a[href^="/cafe/"]').evaluateAll(links => links.map(link => link.getAttribute('href')))
}

try {
  for (const width of [390, 320, 360, 430, 768, 1440]) {
    for (const colorScheme of ['dark', 'light'] as const) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, isMobile: width <= 430, hasTouch: width <= 430, locale: 'fa-IR', timezoneId: 'Asia/Tehran' })
      context.setDefaultNavigationTimeout(120_000)
      await context.route('**/*', route => ['GET', 'HEAD'].includes(route.request().method())
        ? route.continue()
        : route.fulfill({ status: 204 }))
      const page = await context.newPage()
      page.on('pageerror', error => failures.push(error.message))
      await page.goto(new URL('/mashhad/menu', base).href, { waitUntil: 'networkidle' })
      assert.equal(await page.getByText('مقایسهٔ مستقیم').count(), 0)
      assert.equal(await page.getByText('خوراکی‌های محبوب', { exact: true }).count(), 0)
      const featured = page.locator('main a').filter({ has: page.locator('img[src^="/home/categories/"]') })
      assert.equal(await featured.count(), 6)
      if (width <= 430) {
        const rectangles = await featured.evaluateAll(links => links.slice(0, 2).map(link => ({ top: link.getBoundingClientRect().top, left: link.getBoundingClientRect().left })))
        assert.equal(rectangles[0]?.top, rectangles[1]?.top, `two columns at ${width}`)
        assert.notEqual(rectangles[0]?.left, rectangles[1]?.left)
      }
      const itemList = await collection(page)
      const allDestinations = await page.locator('#all-categories a').evaluateAll(links => links.map(link => new URL((link as HTMLAnchorElement).href).pathname))
      assert.deepEqual(new Set(allDestinations), new Set(itemList.mainEntity.itemListElement.map((item: { url: string }) => new URL(item.url).pathname)))
      for (const details of await page.locator('#all-categories details').all()) {
        await details.locator('summary').focus()
        await page.keyboard.press('Enter')
        assert.equal(await details.getAttribute('open'), '')
        for (const link of await details.locator('a').all()) assert.ok(await link.isVisible())
        await details.locator('summary').click()
      }
      await page.evaluate(() => scrollTo(0, 0))
      await inspect(page, `hub-${width}-${colorScheme}`)
      await page.goto(new URL('/mashhad/menu/coffee', base).href, { waitUntil: 'networkidle' })
      assert.equal((await cafeLinks(page)).length, 12)
      await inspect(page, `coffee-${width}-${colorScheme}`)
      console.log(`✓ ${width}px ${colorScheme}: hub, category, images, overflow, keyboard groups`)
      if (width === 390 && colorScheme === 'dark') {
        const first = await cafeLinks(page)
        const total = (await collection(page)).mainEntity.numberOfItems as number
        await page.getByRole('link', { name: 'صفحه بعد', exact: true }).click()
        await page.waitForURL('**/coffee?page=2#results')
        const second = await cafeLinks(page)
        assert.equal(second.length, 12)
        assert.ok(first.every(link => !second.includes(link)), 'page boundaries must not repeat cafés')
        assert.match(await page.locator('link[rel="canonical"]').getAttribute('href') ?? '', /\/coffee\?page=2$/)
        assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), await page.locator('link[rel="canonical"]').getAttribute('href'))
        assert.equal((await collection(page)).mainEntity.itemListElement[0].position, 13)
        await page.reload({ waitUntil: 'networkidle' })
        assert.deepEqual(await cafeLinks(page), second, 'pagination order is stable across reloads')
        await inspect(page, 'coffee-page2-390-dark')
        await page.goBack({ waitUntil: 'networkidle' })
        await page.waitForFunction(expected => document.querySelector('#results a[href^="/cafe/"]')?.getAttribute('href') === expected, first[0])
        assert.deepEqual(await cafeLinks(page), first, 'back restores page one')
        await page.goForward({ waitUntil: 'networkidle' })
        await page.waitForFunction(expected => document.querySelector('#results a[href^="/cafe/"]')?.getAttribute('href') === expected, second[0])
        assert.deepEqual(await cafeLinks(page), second, 'forward restores page two')
        console.log('✓ distinct stable pages, canonical, reload, back and forward')
        // Start sorting from a fresh document, independently of browser form restoration.
        await page.reload({ waitUntil: 'networkidle' })
        await page.getByLabel('مرتب‌سازی', { exact: true }).selectOption('name')
        await page.getByRole('button', { name: 'نمایش', exact: true }).click()
        await page.waitForURL('**/coffee?sort=name#results')
        assert.equal(await page.getByLabel('مرتب‌سازی', { exact: true }).inputValue(), 'name')
        assert.match(await page.getByRole('link', { name: 'فیلترهای بیشتر', exact: true }).getAttribute('href') ?? '', /^\/search\?f=coffee&sort=name$/)
        await page.getByRole('link', { name: 'صفحه بعد', exact: true }).click()
        await page.waitForURL('**/coffee?sort=name&page=2#results')
        assert.match(await page.locator('link[rel="canonical"]').getAttribute('href') ?? '', /\/coffee\?sort=name&page=2$/)
        console.log('✓ sort selection, filter handoff, preserved sorted page URL and canonical')
        for (const query of ['page=0', 'page=-2', 'page=broken', 'page=1.5', 'page=2&page=3', 'sort=broken']) {
          await page.goto(new URL(`/mashhad/menu/coffee?${query}`, base).href, { waitUntil: 'networkidle' })
          assert.deepEqual(await cafeLinks(page), first, `invalid query ${query} falls back to first page`)
          assert.match(await page.locator('link[rel="canonical"]').getAttribute('href') ?? '', /\/coffee$/)
        }
        await page.goto(new URL('/mashhad/menu/coffee?page=999999999', base).href, { waitUntil: 'networkidle' })
        const last = Math.ceil(total / 12)
        assert.equal((await cafeLinks(page)).length, total - (last - 1) * 12)
        assert.match(await page.locator('link[rel="canonical"]').getAttribute('href') ?? '', new RegExp(`\\?page=${last}$`))
        for (const facet of ['breakfast', 'pasta', 'pizza', 'main_dish', 'cake_dessert', 'brewed_coffee']) {
          await page.goto(new URL(`/mashhad/menu/${facet}`, base).href, { waitUntil: 'networkidle' })
          assert.equal((await cafeLinks(page)).length, 12)
          await inspect(page, `${facet}-390-dark`)
        }
        const response = await page.goto(new URL('/mashhad/menu/not-a-real-facet', base).href, { waitUntil: 'networkidle' })
        assert.equal(response?.status(), 404)
      }
      await context.close()
    }
  }
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, userAgent: 'Googlebot KuCafeFoodReadOnlyQA' })
  const page = await context.newPage()
  await page.goto(new URL('/mashhad/menu', base).href)
  assert.ok(await page.locator('#all-categories a').count() > 6, 'all facet links are available without JavaScript')
  await page.locator('#all-categories summary').first().click()
  assert.ok(await page.locator('#all-categories details').first().locator('a').first().isVisible())
  await page.goto(new URL('/mashhad/menu/coffee?page=2', base).href)
  assert.equal((await cafeLinks(page)).length, 12, 'page two is server rendered without JavaScript')
  assert.equal((await collection(page)).mainEntity.itemListElement[0].position, 13)
  await context.close()
  assert.deepEqual(failures, [], 'browser runtime errors')
  console.log(JSON.stringify({ result: 'passed', output, measurements }, null, 2))
} finally {
  await browser.close()
}
