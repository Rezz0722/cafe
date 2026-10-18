import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/$/, '')
const browser = await chromium.launch({ headless: true })

try {
  for (const width of [360, 390, 1440]) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'fa-IR' })
      await page.route('**/api/*track**', request => request.fulfill({ status: 204 }))
      await page.addInitScript(value => localStorage.setItem('kucafe-theme-mode', value), theme)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(`${base}/search`, { waitUntil: 'domcontentloaded' })
      assert.equal(await page.getByText('شروع از خوراکی:').count(), 0)
      assert.equal(await page.getByRole('button', { name: 'آیتم‌های منو' }).count(), 1)
      assert.equal(await page.getByRole('button', { name: 'اعمال', exact: true }).count(), 0)
      assert.ok(await page.locator('a[href^="/cafe/"]').count() > 0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert.ok(overflow <= 1, `${width}px ${theme}: ${overflow}px horizontal overflow`)
      if (width < 820) {
        const tools = await Promise.all(['نزدیک من', 'الان باز', /فیلترها/].map(name => page.getByRole('button', { name }).boundingBox()))
        assert.ok(tools.every(Boolean))
        assert.ok(Math.max(...tools.map(box => box!.y)) - Math.min(...tools.map(box => box!.y)) < 2, 'mobile tools must share one row')
        await page.getByRole('button', { name: /فیلترها/ }).click()
        const dialog = page.getByRole('dialog', { name: 'فیلترهای جست‌وجو' })
        assert.equal(await dialog.isVisible(), true)
        assert.equal(await dialog.getByRole('combobox', { name: 'ترتیب نتایج' }).count(), 1)
        assert.equal(await dialog.getByRole('link', { name: 'نقشه' }).count(), 1)
        await page.keyboard.press('Escape')
        assert.equal(await dialog.isVisible(), false)
      }
      assert.deepEqual(errors, [])
      await page.goto(`${base}/search?dish=alfredo-pasta`, { waitUntil: 'domcontentloaded' })
      assert.ok((await page.getByRole('heading', { level: 1 }).innerText()).includes('پاستا'))
      assert.ok(await page.locator('a[href^="/item/"]').count() > 0, 'existing dish deep link must still show menu items')
      await page.close()
    }
  }
  console.log('Public search cleanup: 6 viewport/theme combinations, filter sheet and dish deep links passed')
} finally {
  await browser.close()
}
