import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, firefox, webkit } from 'playwright'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, closeDb } from '../src/db/connection'
import { appUser, auditLog, place, venueLead, venueLeadRate } from '../src/db/schema'
import { createAuthSession } from '../src/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '../src/core/auth/session'

const base = process.argv[2] || 'http://127.0.0.1:3201'
assert.equal(new URL(base).hostname, '127.0.0.1', 'No production test writes')
assert.equal(new URL(process.env.DATABASE_URL || '').pathname, '/kucafe_phase1_test', 'Isolated database required')
const db = getDb(), fixture = randomUUID().slice(0, 8), adminId = randomUUID(), ownerId = randomUUID(), otherId = randomUUID(), unverifiedId = randomUUID()
const phone = '09123456789', otherPhone = '09123456780', venueIds: number[] = [], leadIds: string[] = [], results: object[] = []
const output = 'var/qa/phase1'
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
try {
  await db.insert(appUser).values([{ id: adminId, name: 'QA admin', role: 'admin', username: `qa-admin-${fixture}` }, { id: ownerId, name: 'QA owner', phone, phoneVerifiedAt: new Date() }, { id: otherId, name: 'QA other', phone: otherPhone, phoneVerifiedAt: new Date() }, { id: unverifiedId, name: 'QA unverified', phone: '09123456782' }])
  for (const branch of ['a', 'b']) { const [r] = await db.insert(place).values({ name: `QA cafe ${fixture} ${branch}`, nameNormalized: `QA ${fixture}`, slug: `qa-${fixture}-${branch}`, status: 'published' }); venueIds.push(r.insertId) }
  for (const [name, launcher] of Object.entries({ chromium, firefox, webkit })) {
    const instance = await launcher.launch()
    try {
      for (const width of [360, 390, 768, 1440]) {
        const page = await instance.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block' })
        const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
        await page.goto(`${base}/for-cafes?from=home`, { waitUntil: 'networkidle' })
        await page.getByRole('heading', { level: 2, name: 'راه‌اندازی پنل کافه‌ات را از اینجا شروع کن' }).waitFor()
        const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
        assert.ok(size.scroll <= size.width + 1)
        assert.equal(await page.locator('#panel-request input[required]').count(), 5)
        await page.locator('#lead-contactName').focus()
        assert.notEqual(await page.locator('#lead-contactName').evaluate(el => getComputedStyle(el).outlineStyle), 'none')
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true })
        assert.deepEqual(errors, [])
        await page.close(); results.push({ engine: name, width, status: 'pass', checks: ['form SSR', 'no overflow', 'labels', 'keyboard focus', 'no runtime errors'] })
      }
    } finally { await instance.close() }
  }
  const anonymous = await browser.newContext({ serviceWorkers: 'block' }), page = await anonymous.newPage()
  for (const [index, cafeName] of [`QA lead ${fixture} a`, `QA lead ${fixture} b`].entries()) {
    await page.goto(`${base}/for-cafes?from=home`, { waitUntil: 'networkidle' })
    await page.getByLabel('نام شما', { exact: false }).fill('QA owner')
    await page.getByLabel('موبایل برای تماس', { exact: false }).fill(index ? otherPhone : phone)
    await page.getByLabel('نام کافه', { exact: false }).fill(cafeName)
    await page.getByLabel('شهر', { exact: false }).fill('مشهد')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'ثبت درخواست پنل', exact: true }).click()
    await page.getByRole('heading', { name: 'درخواست شما دریافت شد' }).waitFor()
    const [lead] = await db.select().from(venueLead).where(eq(venueLead.cafeName, cafeName))
    assert.ok(lead); leadIds.push(lead.id); assert.equal(lead.userId, null)
  }
  await page.goto(`${base}/admin/leads`); assert.equal(new URL(page.url()).pathname, '/auth')
  await anonymous.close()
  results.push({ status: 'pass', checks: ['two anonymous real form submits', 'no implicit role', 'private inbox rejects guest'] })
  const auth = async (id: string, role: 'admin' | 'customer', number: string, method: 'otp' | 'password' = 'otp') => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const sessionId = await createAuthSession({ userId: id, method, expiresAt: new Date(Date.now() + 3600000) })
    await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken({ sessionId, userId: id, phone: number, role }), url: base, httpOnly: true, sameSite: 'Lax' }])
    return context
  }
  const unverified = await auth(unverifiedId, 'customer', '09123456782', 'password'), unverifiedPage = await unverified.newPage()
  await unverifiedPage.goto(`${base}/profile/venue-requests`)
  await unverifiedPage.getByRole('heading', { name: 'ابتدا شمارهٔ حسابتان را تأیید کنید' }).waitFor()
  assert.equal(await unverifiedPage.getByRole('button', { name: 'درخواست بررسی مالکیت این شعبه' }).count(), 0)
  await unverifiedPage.getByRole('button', { name: 'خروج', exact: true }).click()
  await unverifiedPage.waitForURL(u => u.pathname === '/auth')
  assert.equal(new URL(unverifiedPage.url()).searchParams.get('redirect'), '/profile/venue-requests')
  await unverified.close()
  results.push({ status: 'pass', checks: ['unverified user cannot read/claim', 'sign-out opens verification auth without redirect loop'] })
  const other = await auth(otherId, 'customer', otherPhone), otherPage = await other.newPage()
  await otherPage.goto(`${base}/profile/venue-requests`)
  assert.equal(await otherPage.getByText(`QA lead ${fixture} a`, { exact: false }).count(), 0)
  assert.equal(await otherPage.getByText(`QA lead ${fixture} b`, { exact: false }).count(), 1)
  await other.close()
  const owner = await auth(ownerId, 'customer', phone), ownerPage = await owner.newPage()
  await ownerPage.goto(`${base}/profile/venue-requests`, { waitUntil: 'networkidle' })
  await ownerPage.getByLabel('شعبهٔ دقیق کافه را انتخاب کنید').selectOption(String(venueIds[0]))
  await ownerPage.getByRole('button', { name: 'درخواست بررسی مالکیت این شعبه' }).click()
  await ownerPage.getByText('شعبه برای بررسی انتخاب شده است.', { exact: false }).waitFor()
  const admin = await auth(adminId, 'admin', ''), adminPage = await admin.newPage()
  await adminPage.goto(`${base}/admin/leads`, { waitUntil: 'networkidle' })
  const card = adminPage.locator('li').filter({ has: adminPage.getByRole('heading', { name: `QA lead ${fixture} a · مشهد` }) }).first()
  await card.getByText('بررسی و فعال‌سازی پنل همین شعبه', { exact: true }).click()
  await card.getByLabel('روش احراز مالکیت و شاهد بررسی').fill('QA human review of correct fixture branch')
  await card.getByRole('checkbox').check()
  await card.getByRole('button', { name: 'تأیید مالکیت و فعال‌سازی پنل' }).click()
  await card.locator('span').getByText('پنل فعال شد', { exact: true }).waitFor()
  await ownerPage.reload({ waitUntil: 'networkidle' })
  await ownerPage.getByRole('link', { name: 'ورود به پنل کافه' }).click()
  await ownerPage.waitForURL(u => u.pathname === '/admin/venue')
  assert.equal(new URL(ownerPage.url()).pathname, '/admin/venue')
  assert.ok(!new URL(ownerPage.url()).pathname.startsWith('/auth'))
  await owner.close(); await admin.close()
  results.push({ status: 'pass', checks: ['own verified account only', 'claim submits without role', 'human approval', 'owner enters venue panel'] })
  const noJs = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await noJs.newPage()
  await staticPage.goto(`${base}/for-cafes`)
  assert.equal(await staticPage.getByRole('button', { name: 'ثبت درخواست پنل' }).count(), 1)
  await staticPage.locator('#lead-contactName').fill('QA noJS')
  await staticPage.locator('#lead-contactPhone').fill('09123456781')
  await staticPage.locator('#lead-cafeName').fill(`QA lead ${fixture} noJS`)
  await staticPage.locator('#lead-city').fill('مشهد')
  await staticPage.getByRole('checkbox').check()
  await staticPage.getByRole('button', { name: 'ثبت درخواست پنل' }).click()
  await staticPage.getByRole('heading', { name: 'درخواست شما دریافت شد' }).waitFor()
  const [staticLead] = await db.select().from(venueLead).where(eq(venueLead.cafeName, `QA lead ${fixture} noJS`))
  assert.ok(staticLead); leadIds.push(staticLead.id)
  await noJs.close()
  results.push({ status: 'pass', checks: ['no-JS form rendered and real native submission'] })
} finally {
  await browser.close()
  if (leadIds.length) { await db.delete(venueLead).where(inArray(venueLead.id, leadIds)); await db.delete(auditLog).where(and(eq(auditLog.entity, 'venue_lead'), inArray(auditLog.entityId, leadIds))) }
  await db.delete(appUser).where(inArray(appUser.id, [adminId, ownerId, otherId, unverifiedId]))
  if (venueIds.length) await db.delete(place).where(inArray(place.id, venueIds))
  await db.delete(venueLeadRate)
  await closeDb()
}
await writeFile(`${output}/browser.json`, JSON.stringify({ testedAt: new Date().toISOString(), environment: 'isolated local QA, not live OTP', results }, null, 2))
console.log(`PASS ${results.length} browser journeys; fixtures removed; no SMS sent`)
