import assert from 'node:assert/strict'
import { chromium, type Page } from 'playwright'

// All action responses are mocked, including verification. Never send an SMS
// or write an account while checking the expiry/resend behaviour.
const base = process.env.KUCAFE_OTP_QA_URL || 'http://127.0.0.1:3197'
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use an isolated local server')
const phone = process.env.KUCAFE_AUTH_QA_PHONE || '09000000000' // Fully mocked; never sent to a provider.
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

async function chooseSms(page: Page) {
  await page.goto(`${base}/auth`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.getByRole('tab', { name: 'کد یک‌بارمصرف', exact: true }).click()
  await page.locator('input[name="phone"]').fill(phone)
}

try {
  const page = await browser.newPage()
  let requests = 0
  await page.route('**/api/auth/otp?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false }) }))
  await page.route('**/auth*', async route => {
    const request = route.request()
    if (request.method() !== 'POST') return route.continue()
    requests++
    assert.ok(request.postData()?.includes(phone), 'Resend must preserve the selected phone')
    const result = requests === 3
      ? { ok: false, error: 'تا ارسال دوباره ۱۲۰ ثانیه صبر کنید.', retryAfterSec: 120 }
      : { ok: true, phone, devMode: false, challengeId: requests, serverNow: Date.now(), expiresAt: Date.now() + 60_000, resendAt: Date.now() + 90_000 }
    await route.fulfill({
      status: 200,
      contentType: 'text/x-component',
      body: `0:{"a":"$@1","f":"","b":"development"}\n1:${JSON.stringify(result)}\n`,
    })
  })
  await chooseSms(page)
  await page.clock.install()
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click()
  await page.locator('input[name="code"]').waitFor()
  const resend = page.getByRole('form', { name: 'ارسال دوبارهٔ کد ورود' }).getByRole('button')
  assert.equal(await resend.isDisabled(), true, 'Respect the initial server cooldown')

  await page.clock.fastForward(61_000)
  await page.getByRole('status').filter({ hasText: 'اعتبار این کد تمام شده است' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).isDisabled(), true)
  assert.equal(await resend.isDisabled(), true, 'Expiry must not bypass the 90-second cooldown')
  assert.equal(requests, 1, 'Expiry must not automatically send another message')

  await page.clock.fastForward(30_000)
  await page.getByRole('button', { name: 'ارسال دوبارهٔ کد', exact: true }).waitFor()
  await page.locator('input[name="code"]').fill('12345')
  await resend.click()
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('input[name="code"]')?.value === '')
  assert.equal(requests, 2)
  assert.equal(await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).isEnabled(), true)
  assert.equal(await resend.isDisabled(), true, 'A successful resend starts a new cooldown')
  assert.equal(await page.locator('output').innerText(), '۰۱:۰۰')

  await page.clock.fastForward(91_000)
  await page.getByRole('button', { name: 'ارسال دوبارهٔ کد', exact: true }).waitFor()
  await resend.click()
  await page.getByRole('alert').filter({ hasText: '۱۲۰ ثانیه' }).waitFor()
  assert.equal(await resend.isDisabled(), true, 'Honour a longer cooldown returned by the server')
  await page.getByRole('status').filter({ hasText: 'اعتبار این کد تمام شده است' }).waitFor()
  assert.equal(requests, 3)
  await page.clock.fastForward(121_000)
  await page.getByRole('button', { name: 'ارسال دوبارهٔ کد', exact: true }).waitFor()
  assert.equal(requests, 3, 'A failed resend must not be retried automatically')
  console.log('✓ OTP expiry, explicit resend, cleared input, and server cooldown regression')
} finally {
  await browser.close()
}
