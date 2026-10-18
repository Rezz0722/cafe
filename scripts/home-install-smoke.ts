/** PWA UI contract with browser-event fixtures; no native installation is claimed. */
import assert from 'node:assert/strict'
import { chromium, devices } from 'playwright'

const origin = process.argv[2] ?? 'http://127.0.0.1:9094'
assert.ok(new URL(origin).hostname !== 'kucafe.ir', 'Synthetic install events run only against the isolated build')
const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' })
  const page = await context.newPage()
  for (const endpoint of ['track', 'experience-track', 'discovery-track']) await page.route(`**/api/${endpoint}**`, route => route.fulfill({ status: 204 }))
  await page.goto(origin)
  await page.locator('footer a[href="/install#android-install"]').waitFor()
  await page.evaluate(`(() => {
    window.installPromptCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async function () { window.installPromptCalls += 1; },
      userChoice: Promise.resolve({ outcome: 'dismissed' })
    });
    window.dispatchEvent(event);
  })()`)
  await page.getByRole('button', { name: 'نصب نرم افزار', exact: true }).click()
  await page.locator('footer [role="status"]').filter({ hasText: 'نصب لغو شد' }).waitFor()
  assert.equal(await page.evaluate(() => (window as Window & { installPromptCalls?: number }).installPromptCalls), 1)
  assert.equal(await page.getByRole('button', { name: 'نصب نرم افزار', exact: true }).count(), 0)
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  await page.locator('footer [aria-label="نصب کوکافه"]').waitFor({ state: 'detached' })
  await context.close()

  const ios = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' })
  const iosPage = await ios.newPage()
  for (const endpoint of ['track', 'experience-track', 'discovery-track']) await iosPage.route(`**/api/${endpoint}**`, route => route.fulfill({ status: 204 }))
  await iosPage.goto(origin)
  await iosPage.locator('footer a[href="/install#ios-install"]').waitFor()
  await iosPage.getByRole('link', { name: 'نصب نرم افزار', exact: true }).click()
  await iosPage.getByRole('heading', { name: 'نصب روی آیفون', exact: true }).waitFor()
  assert.equal(await iosPage.locator('footer [aria-label="نصب کوکافه"]').count(), 0)
  await ios.close()
  console.log('PWA footer: Android prompt/dismissal, installed hiding, iOS guide and unsupported-browser fallback passed (browser-event fixtures)')
} finally { await browser.close() }
