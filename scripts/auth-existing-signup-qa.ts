import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium, devices, webkit } from 'playwright'
import mysql from 'mysql2/promise'

// Real HTTP/server-action QA against the dedicated disposable auth database.
// Requires its existing qa_auth_incident fixture; never sends a real SMS.
const database = new URL(process.env.DATABASE_URL!)
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.pathname, '/kucafe_auth_qa_20261020')
assert.equal(process.env.AUTH_DEV_MODE, 'true')
const phone = process.env.KUCAFE_AUTH_QA_PHONE!
assert.match(phone ?? '', /^09\d{9}$/)
const base = 'http://127.0.0.1:3197'
const destination = '/cafe/ramouz-cafe?authIntent=review#reviews'
const runtimeLog = '/tmp/kucafe-auth-qa-runtime.log'
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' })
const providerRequests = () => [...readFileSync(runtimeLog, 'utf8').matchAll(/"outcome":"provider-requested"/g)].length
const counts = async () => {
  const [[row]] = await db.query<mysql.RowDataPacket[]>(
    'SELECT (SELECT COUNT(*) FROM otp_code WHERE phone=?) AS codes, (SELECT COUNT(*) FROM auth_session WHERE user_id=(SELECT id FROM app_user WHERE phone=?)) AS sessions',
    [phone, phone],
  )
  return { codes: Number(row.codes), sessions: Number(row.sessions) }
}

try {
  const [[account]] = await db.query<mysql.RowDataPacket[]>(
    "SELECT username,password_hash IS NOT NULL AS hasPassword FROM app_user WHERE phone=? AND role='customer'",
    [phone],
  )
  assert.equal(account?.username, 'qa_auth_incident')
  assert.equal(Number(account.hasPassword), 1)
  const before = await counts()
  const requestsBefore = providerRequests()
  const spaced = `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`
  const cases = [
    { label: 'Chromium mobile, spaced phone and review destination', engine: chromium, phone: spaced, redirect: destination, expected: destination, javaScriptEnabled: true },
    { label: 'WebKit iPhone, Persian digits', engine: webkit, phone: spaced.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]), redirect: destination, expected: destination, javaScriptEnabled: true },
    { label: 'Chromium, international phone and rejected external redirect', engine: chromium, phone: `+98${phone.slice(1)}`, redirect: '//example.com', expected: '/profile', javaScriptEnabled: true },
  ]
  for (const test of cases) {
    const browser = await test.engine.launch({ headless: true })
    const context = await browser.newContext({ ...devices[test.engine === webkit ? 'iPhone 13' : 'Pixel 5'], javaScriptEnabled: test.javaScriptEnabled })
    const page = await context.newPage()
    page.setDefaultTimeout(30_000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(`${base}/auth/register?redirect=${encodeURIComponent(test.redirect)}`, { waitUntil: 'networkidle', timeout: 90_000 })
      await page.locator('input[name=phone]:not([type=hidden])').fill(test.phone)
      // Bypass the client's sanitized value to exercise server validation too.
      if (test.expected === '/profile') {
        await page.locator('input[name=redirectTo]').evaluate(input => { (input as HTMLInputElement).value = '//example.com' })
      }
      const submitted = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname === '/auth/register')
      await page.getByRole('button', { name: 'ادامه و دریافت کد', exact: true }).click()
      const actionRequest = await submitted
      await page.waitForURL(url => url.pathname === '/auth' && url.searchParams.get('mode') === 'login')
      await page.getByRole('heading', { name: 'ورود به کو کافه', exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('redirect'), test.expected)
      assert.equal(await page.locator('input[name=password]').count(), 1)
      assert.equal(await page.locator('input[name=code]').count(), 0)
      assert.deepEqual(await counts(), before, 'No OTP or session may be created by existing-account signup')
      assert.equal(providerRequests(), requestsBefore, 'Provider must not be called, even in development mode')
      assert.deepEqual(errors, [])
      // Repeat the raw HTTP action without running the signup UI. The server
      // must enforce no-send and safe navigation on direct/repeated requests.
      const actionHeaders = actionRequest.headers()
      const replay = await page.request.post(actionRequest.url(), {
        headers: { 'content-type': actionHeaders['content-type'], 'next-action': actionHeaders['next-action'], origin: base },
        data: actionRequest.postDataBuffer()!,
        maxRedirects: 0,
      })
      assert.equal(replay.status(), 303)
      const target = replay.headers()['x-action-redirect']?.split(';')[0]
      assert.ok(target, 'Direct server action must redirect to login')
      assert.equal(new URL(target, base).pathname, '/auth')
      assert.equal(new URL(target, base).searchParams.get('redirect'), test.expected)
      assert.deepEqual(await counts(), before)
      assert.equal(providerRequests(), requestsBefore)
      console.log(`✓ ${test.label}: login redirect, no SMS call, no OTP/session writes`)
    } finally {
      await browser.close()
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Existing-account signup QA failed'
  throw new Error(message.replaceAll(phone, '[approved-phone]'))
} finally {
  await db.end()
}
