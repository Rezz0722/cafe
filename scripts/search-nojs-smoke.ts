import assert from 'node:assert/strict'
import { chromium, firefox, webkit } from 'playwright'

// Native GET form and visible server-rendered results, not just hidden markup.
const base = process.argv[2] ?? 'http://127.0.0.1:3199'
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch()
  try {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
    page.setDefaultTimeout(60_000)
    await page.goto(base, { waitUntil: 'domcontentloaded' })
    await page.locator('#home-search').fill('پاستا')
    await page.locator('form[role="search"]').filter({ has: page.locator('#home-search') }).getByRole('button', { name: 'پیدا کن' }).click()
    await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('q') === 'پاستا')
    const item = page.locator('h2 a[href^="/item/"]').first()
    await item.waitFor()
    assert.ok((await item.innerText()).includes('پاستا'))
    assert.equal(await page.getByRole('main', { name: 'در حال بارگذاری نتایج' }).count(), 0)
    const href = await item.getAttribute('href')
    assert.ok(href)
    await item.click()
    await page.waitForURL(/\/item\//)
    assert.equal(await page.locator('h1').count(), 1)
    console.log(`PASS ${name}: no-JS native search, visible results and product link`)
  } finally { await browser.close() }
}
