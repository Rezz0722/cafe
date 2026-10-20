import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium, type Page } from 'playwright'
import mysql from 'mysql2/promise'
import { toAsciiDigits } from '../src/core/text/normalize'

assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/kucafe_auth_qa_20261020')
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: 'Z' })
const base = 'http://127.0.0.1:3197'
const phone = process.env.KUCAFE_AUTH_QA_PHONE!
assert.match(phone ?? '', /^09\d{9}$/, 'Set the owner-approved QA phone in the private QA environment')
const runtimeLog = '/tmp/kucafe-auth-qa-runtime.log'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await context.addInitScript({ content: `
  Object.defineProperty(window, 'OTPCredential', { value: function () {}, configurable: true });
  window.__qaWebOtpCalls = 0;
  window.__qaEvents = [];
  ['pointerdown','pointerup','click','focusin','submit'].forEach(function(type) {
    document.addEventListener(type,function(event) {
      var target=event.target;
      window.__qaEvents.push({type:type,tag:target.tagName,text:target.tagName==='BUTTON'?target.textContent:'',scrollY:window.scrollY,prevented:event.defaultPrevented});
      if(window.__qaEvents.length>30)window.__qaEvents.shift();
    },true);
  });
  Object.defineProperty(navigator.credentials, 'get', { configurable: true, value: function(options) {
    window.__qaWebOtpCalls++;
    return new Promise(function(resolve, reject) {
      window.__qaDeliverOtp = function(code) { resolve({ type: 'otp', code: code }); };
      options.signal.addEventListener('abort', function() { reject(new DOMException('Aborted', 'AbortError')); });
    });
  }});
` })
const page = await context.newPage()
page.setDefaultTimeout(30_000)
const pageErrors: string[] = []
page.on('pageerror', error => pageErrors.push(error.message))
const actionResponses: { path: string; status: number; ok: string | undefined; redirect: string | null }[] = []
page.on('response', async response => {
  if (response.request().method() !== 'POST' || !new URL(response.url()).pathname.startsWith('/auth')) return
  const body = await response.text().catch(() => '')
  actionResponses.push({ path: new URL(response.url()).pathname, status: response.status(), ok: body.match(/"ok":(true|false)/)?.[1], redirect: response.headers()['x-action-redirect'] ?? null })
})
const seconds = (text: string) => {
  const [minutes, seconds] = toAsciiDigits(text).split(':').map(Number)
  return minutes * 60 + seconds
}
const devCode = () => {
  const matches = [...readFileSync(runtimeLog, 'utf8').matchAll(/│\s+(\d{5})\s+│/g)]
  assert.ok(matches.length > 0, 'A local development OTP must be available')
  return matches.at(-1)![1]
}
async function ready(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90_000 })
}
async function releaseCooldown() {
  // Advance only this isolated fixture's request history, never production.
  await db.query("UPDATE otp_code SET created_at=UTC_TIMESTAMP()-INTERVAL 91 SECOND, expires_at=expires_at")
}
try {
  await db.query("SET time_zone='+00:00'")
  if (process.env.KUCAFE_AUTH_QA_RESET === '1') {
    const [owned] = await db.query<mysql.RowDataPacket[]>("SELECT id FROM app_user WHERE phone=? AND username='qa_auth_incident' AND role='customer'", [phone])
    for (const row of owned) { await db.query('DELETE FROM auth_session WHERE user_id=?', [row.id]); await db.query('DELETE FROM app_user WHERE id=?', [row.id]) }
    await db.query('DELETE FROM otp_code WHERE phone=?', [phone])
  }
  const [[users]] = await db.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS n FROM app_user WHERE phone=?", [phone])
  assert.equal(users.n, 0, 'Run new-account QA once on the empty isolated database')
  await ready(page, `${base}/cafe/ramouz-cafe#reviews`)
  await page.waitForFunction(() => document.getElementById('page-top')?.dataset.cafeReady === 'true')
  await page.getByRole('link', { name: /ورود و ثبت.*تجربه/ }).first().tap()
  await page.getByRole('heading', { name: 'ساخت حساب', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/auth/register')
  assert.match(new URL(page.url()).searchParams.get('redirect')!, /authIntent=review#reviews$/)
  const oldAccount = page.getByRole('link', { name: 'قبلاً ثبت‌نام کردم؛ ورود' })
  assert.ok((await oldAccount.boundingBox())!.y < 844, 'Existing-account choice must be visible without a long scroll')
  await page.locator('input[name=phone]').fill(phone)
  await page.getByRole('button', { name: 'ادامه و دریافت کد', exact: true }).click()
  await page.locator('input[name=code]').waitFor()
  const signupCode = devCode()
  const state = await (await page.request.get(`${base}/api/auth/otp?purpose=verify_phone`)).json()
  assert.ok(state.ok && state.expiresAt > state.serverNow)
  await page.locator('input[name=code]').fill(signupCode === '00000' ? '11111' : '00000')
  await page.getByRole('button', { name: 'تأیید کد و ادامه', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'اشتباه' }).waitFor()
  const [[afterWrong]] = await db.query<mysql.RowDataPacket[]>('SELECT attempts,UNIX_TIMESTAMP(expires_at)*1000 AS expiry FROM otp_code WHERE id=?', [state.challengeId])
  assert.equal(afterWrong.attempts, 1)
  assert.equal(Number(afterWrong.expiry), state.expiresAt)
  await page.locator('input[name=code]').fill(signupCode)
  await page.getByRole('button', { name: 'تأیید کد و ادامه', exact: true }).click()
  await page.getByRole('heading', { name: 'چطور صدایت کنیم؟' }).waitFor()
  // The consumed OTP may expire while the already-verified user completes
  // profile/password. A bounded registration proof, not an expired OTP, is used.
  await db.query('UPDATE otp_code SET expires_at=UTC_TIMESTAMP()-INTERVAL 1 SECOND WHERE id=?', [state.challengeId])
  await page.getByRole('textbox', { name: 'نام', exact: true }).fill('QA Authentication')
  await page.getByRole('textbox', { name: 'نام کاربری', exact: false }).fill('qa_auth_incident')
  await page.getByRole('button', { name: 'ادامه', exact: true }).click()
  await page.locator('input[name=password]').fill('QA-only-Auth-2026!')
  await page.locator('input[name=passwordConfirm]').fill('QA-only-Auth-2026!')
  await page.getByRole('button', { name: 'ساخت حساب و ورود', exact: true }).click()
  await page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' }).waitFor({ timeout: 30_000 })
  assert.equal(new URL(page.url()).pathname, '/cafe/ramouz-cafe')
  assert.equal(new URL(page.url()).hash, '#reviews')
  assert.equal((await context.cookies()).find(c => c.name === 'cafegard_session')?.httpOnly, true)
  console.log('✓ New signup: cafe intent, visible account choices, wrong then correct OTP, bounded proof, session and resumed review dialog')
  await context.clearCookies()
  await releaseCooldown()
  await ready(page, `${base}/auth?mode=login&redirect=${encodeURIComponent('/cafe/ramouz-cafe?authIntent=review#reviews')}`)
  await page.getByRole('tab', { name: 'کد یک‌بارمصرف', exact: true }).click()
  await page.locator('input[name=phone]').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click()
  await page.locator('input[name=code]').waitFor()
  const loginCode = devCode()
  await page.evaluate(code => (window as unknown as { __qaDeliverOtp: (code: string) => void }).__qaDeliverOtp(code), loginCode)
  await page.waitForFunction(expected => document.querySelector<HTMLInputElement>('input[name="code"]')?.value === expected, loginCode)
  assert.ok(await page.locator('input[name=code]').inputValue() === loginCode, 'WebOTP credential must update the actual controlled input')
  const beforeFocus = await (await page.request.get(`${base}/api/auth/otp?purpose=login`)).json()
  await db.query('UPDATE otp_code SET expires_at=expires_at-INTERVAL 15 SECOND WHERE id=?', [beforeFocus.challengeId])
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(() => {
    const text = document.querySelector('output')?.textContent?.replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))) ?? ''
    const [m, s] = text.split(':').map(Number)
    return m * 60 + s <= 45
  })
  const afterFocus = await (await page.request.get(`${base}/api/auth/otp?purpose=login`)).json()
  assert.equal(afterFocus.challengeId, beforeFocus.challengeId, 'Returning from background synchronizes without issuing an OTP')
  assert.equal(await page.locator('input[name=code]').inputValue(), loginCode, 'Synchronization must preserve the entered code')
  const initialRemaining = seconds(await page.locator('output').innerText())
  await page.clock.install()
  await page.clock.setSystemTime(new Date('2035-01-01T00:00:00Z'))
  const afterClockChange = seconds(await page.locator('output').innerText())
  assert.ok(afterClockChange > 0 && Math.abs(initialRemaining - afterClockChange) <= 2, 'Changing device time must not expire the challenge')
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('input[name=code]').waitFor()
  assert.ok(seconds(await page.locator('output').innerText()) > 0, 'Refresh restores the server-bound challenge')
  await page.locator('input[name=code]').fill(loginCode === '00000' ? '11111' : '00000')
  await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'اشتباه' }).waitFor()
  // A refresh removes input text; manual paste must still accept the same
  // unexpired backend challenge after one incorrect attempt.
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  await page.evaluate(code => navigator.clipboard.writeText(code), loginCode)
  await page.locator('input[name=code]').fill('')
  await page.locator('input[name=code]').press('Control+V')
  assert.equal(await page.locator('input[name=code]').inputValue(), loginCode, 'Actual paste must update controlled OTP state')
  await page.getByRole('button', { name: 'تأیید و ورود', exact: true }).click()
  await page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' }).waitFor({ timeout: 30_000 })
  console.log('✓ Existing OTP login: live server countdown, device clock change, refresh, wrong then correct, session and return intent')
  await context.clearCookies()
  await ready(page, `${base}/auth?mode=login&redirect=${encodeURIComponent('/cafe/ramouz-cafe#reviews')}`)
  await page.locator('input[name=identifier]').fill(phone)
  await page.locator('input[name=password]').fill('QA-only-Auth-2026!')
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/cafe/ramouz-cafe')
  const [[reviews]] = await db.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM review')
  assert.equal(reviews.n, 0, 'Authentication must not submit a review')
  console.log('✓ Existing password login and internal return; no review was submitted')
  await context.clearCookies()
  await db.query("UPDATE app_user SET must_change_password=1 WHERE phone=? AND username='qa_auth_incident'", [phone])
  await ready(page, `${base}/auth?mode=login&redirect=${encodeURIComponent('/cafe/ramouz-cafe?authIntent=review#reviews')}`)
  await page.locator('input[name=identifier]').fill(phone)
  await page.locator('input[name=password]').fill('QA-only-Auth-2026!')
  await page.getByRole('button', { name: 'ورود به حساب', exact: true }).click()
  await page.locator('input[name=currentPassword]').waitFor()
  await page.locator('input[name=currentPassword]').fill('QA-only-Auth-2026!')
  await page.locator('input[name=newPassword]').fill('QA-only-Auth-2026-v2!')
  await page.locator('input[name=newPasswordConfirm]').fill('QA-only-Auth-2026-v2!')
  await page.getByRole('button', { name: 'تغییر رمز', exact: true }).click()
  await page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' }).waitFor()
  console.log('✓ Forced password change preserves the original cafe and review intent')
  await context.clearCookies()
  await releaseCooldown()
  await ready(page, `${base}/auth/recover?redirect=${encodeURIComponent('/cafe/ramouz-cafe?authIntent=review#reviews')}`)
  await page.locator('input[name=phone]').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد بازیابی', exact: true }).click()
  await page.locator('input[name=code]').waitFor()
  const resetCode = devCode()
  for (const code of [resetCode === '00000' ? '11111' : '00000', resetCode]) {
    await page.locator('input[name=code]').fill(code)
    await page.locator('input[name=password]').fill('QA-only-Auth-2026-v3!')
    await page.locator('input[name=passwordConfirm]').fill('QA-only-Auth-2026-v3!')
    await page.getByRole('button', { name: 'ذخیره رمز و ورود', exact: true }).click()
    if (code !== resetCode) await page.getByRole('alert').filter({ hasText: 'نامعتبر' }).waitFor()
  }
  await page.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' }).waitFor()
  const [[sessions]] = await db.query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM auth_session WHERE revoked_at IS NULL AND user_id=(SELECT id FROM app_user WHERE phone=?)', [phone])
  assert.equal(sessions.n, 1, 'Password reset revokes earlier sessions')
  console.log('✓ Password recovery: wrong then correct same challenge, new session, prior sessions revoked, original review resumed')
  await context.clearCookies()
  await releaseCooldown()
  await ready(page, `${base}/auth?mode=login`)
  await page.getByRole('tab', { name: 'کد یک‌بارمصرف', exact: true }).click()
  await page.locator('input[name=phone]').fill(phone)
  await page.getByRole('button', { name: 'دریافت کد ورود', exact: true }).click()
  await page.locator('input[name=code]').waitFor()
  await page.getByRole('button', { name: 'تغییر شماره', exact: true }).click()
  await page.locator('input[name=phone]:not([type=hidden])').waitFor()
  const cleared = await (await page.request.get(`${base}/api/auth/otp?purpose=login`)).json()
  assert.equal(cleared.ok, false, 'Changing phone must finish clearing the browser challenge cookie')
  console.log('✓ Change phone clears the old challenge before exposing the next request form')
} catch (error) {
  const sessionCookie = (await context.cookies()).find(c => c.name === 'cafegard_session')
  const profile = await page.request.get(`${base}/profile`, { maxRedirects: 0 }).catch(() => null)
  console.error(JSON.stringify({ path: new URL(page.url()).pathname, pageErrors, actionResponses, sessionCookie: sessionCookie ? { exists: true, httpOnly: sessionCookie.httpOnly, secure: sessionCookie.secure } : { exists: false }, profileHttp: profile?.status(), events: await page.evaluate(() => (window as unknown as { __qaEvents: unknown[] }).__qaEvents), screen: (await page.locator('main').innerText().catch(() => '')).slice(0,1800) }))
  await page.screenshot({ path: '/tmp/kucafe-auth-incident-failure.png', mask: [page.locator('input')] }).catch(() => {})
  const message = error instanceof Error ? error.message : 'Authentication browser QA failed'
  throw new Error(message.replaceAll(phone, '[approved-phone]').replace(/\b\d{5}\b/g, '[redacted-code]'))
} finally {
  await browser.close()
  await db.end()
}
