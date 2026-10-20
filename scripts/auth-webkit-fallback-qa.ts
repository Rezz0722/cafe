import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { devices, webkit } from 'playwright'
import mysql from 'mysql2/promise'

const url = new URL(process.env.DATABASE_URL!)
assert.ok(url.hostname === '127.0.0.1' && url.pathname === '/kucafe_auth_qa_20261020')
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' })
const browser = await webkit.launch({ headless: true })
const context = await browser.newContext({ ...devices['iPhone 13'] })
const page = await context.newPage()
page.setDefaultTimeout(30_000)
const phone = process.env.KUCAFE_AUTH_QA_PHONE!
assert.match(phone ?? '', /^09\d{9}$/, 'Set the owner-approved QA phone in the private QA environment')
const base = 'http://127.0.0.1:3197'
try {
  await db.query("SET time_zone='+00:00'")
  await db.query('UPDATE otp_code SET created_at=UTC_TIMESTAMP()-INTERVAL 91 SECOND, expires_at=expires_at WHERE phone=?', [phone])
  await page.goto(`${base}/auth?mode=login&redirect=${encodeURIComponent('/cafe/ramouz-cafe?authIntent=review#reviews')}`, { waitUntil: 'networkidle' })
  assert.equal(await page.evaluate(() => 'OTPCredential' in window), false, 'Exercise the unsupported WebOTP fallback')
  await page.getByRole('tab', { name: 'کد یک‌بارمصرف', exact: true }).click()
  await page.locator('input[name=phone]').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click()
  const input = page.locator('input[name=code]')
  await input.waitFor()
  assert.equal(await input.getAttribute('autocomplete'), 'one-time-code')
  assert.equal(await input.getAttribute('inputmode'), 'numeric')
  const matches = [...readFileSync('/tmp/kucafe-auth-qa-runtime.log', 'utf8').matchAll(/│\s+(\d{5})\s+│/g)]
  const code = matches.at(-1)![1]
  // Whole-string entry exercises the same controlled input path as paste and
  // Safari's native OTP suggestion. This is not an actual SMS/keyboard test.
  await input.fill(code === '00000' ? '۱۱۱۱۱' : '۰۰۰۰۰')
  await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'اشتباه' }).waitFor()
  await input.fill(code.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]))
  assert.equal(await input.inputValue(), code)
  await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).click()
  await page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' }).waitFor()
  assert.equal(new URL(page.url()).hash, '#reviews')
  assert.equal((await context.cookies()).find(cookie => cookie.name === 'cafegard_session')?.httpOnly, true)
  console.log('✓ WebKit iPhone viewport: no WebOTP, full-value Persian input, wrong then correct, session and resumed review')
  await context.clearCookies()
  await page.goto(`${base}/auth?mode=login&redirect=${encodeURIComponent('/cafe/ramouz-cafe#reviews')}`, { waitUntil: 'networkidle' })
  await page.locator('input[name=identifier]').fill('qa_auth_incident')
  await page.locator('input[name=password]').fill('QA-only-Auth-2026-v3!')
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click()
  await page.waitForURL(target => target.pathname === '/cafe/ramouz-cafe' && target.hash === '#reviews')
  console.log('✓ WebKit username/password login preserves the exact internal destination and hash')
} catch (error) {
  const message = error instanceof Error ? error.message : 'WebKit authentication QA failed'
  throw new Error(message.replaceAll(phone, '[approved-phone]').replace(/\b\d{5}\b/g, '[redacted-code]'))
} finally {
  await browser.close()
  await db.end()
}
