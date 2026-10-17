import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdir } from 'node:fs/promises'
import { and, eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, authSession, bookingItemIntent, bookingRequest, bookingStatusHistory,
  menuItem, menuSection, place, userPlaceRole, venueBookingSettings } from '@/db/schema'
import { createAuthSession } from '@/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '@/core/auth/session'
import { tehranCivilNow } from './policy'

async function freePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  server.close()
  await once(server, 'close')
  return address.port
}

test('isolated signed HTTP booking pages and optional browser journey', {
  skip: process.env.KUCAFE_BOOKING_HTTP_TEST !== '1', timeout: 150_000,
}, async () => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_booking_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { customer: randomUUID(), owner: randomUUID(), staff: randomUUID() }
  const slug = `qa-booking-http-${suffix}`
  let placeId: number | null = null, itemId: number | null = null
  let child: ReturnType<typeof spawn> | null = null
  let browser: Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>> | null = null
  try {
    await db.insert(appUser).values([
      { id: ids.customer, role: 'customer', name: 'QA customer', phone: '09120000003', phoneVerifiedAt: new Date() },
      { id: ids.owner, role: 'owner', name: 'QA owner' },
      { id: ids.staff, role: 'owner', name: 'QA staff' },
    ])
    const [venue] = await db.insert(place).values({ slug, name: 'کافهٔ آزمایشی رزرو', nameNormalized: 'کافه آزمایشی رزرو', status: 'published', kind: 'cafe' })
    placeId = venue.insertId
    await db.insert(userPlaceRole).values([
      { userId: ids.owner, placeId, role: 'owner' },
      { userId: ids.staff, placeId, role: 'staff' },
    ])
    await db.insert(venueBookingSettings).values({ placeId, enabled: true, requestFrom: '09:00:00', requestUntil: '22:00:00', maxPartySize: 8, minNoticeMinutes: 60, maxAdvanceDays: 30 })
    const [section] = await db.insert(menuSection).values({ placeId, name: 'نوشیدنی', branchScope: 'branch' })
    const [item] = await db.insert(menuItem).values({ placeId, sectionId: section.insertId,
      publicId: `qa_book_${suffix}`, name: 'لاتهٔ آزمایشی', nameNormalized: 'لاته آزمایشی', price: 120000, available: true })
    itemId = item.insertId
    const cookies: Record<string, string> = {}
    for (const [role, userId] of Object.entries(ids)) {
      const sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 300_000) })
      cookies[role] = `${SESSION_COOKIE}=${createSessionToken({ sessionId, userId, phone: '', role: role === 'customer' ? 'customer' : 'owner' })}`
    }
    const port = await freePort(), origin = `http://127.0.0.1:${port}`
    let output = ''
    child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
      cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_SITE_URL: origin }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout?.on('data', chunk => { output = (output + String(chunk)).slice(-3000) })
    child.stderr?.on('data', chunk => { output = (output + String(chunk)).slice(-3000) })
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) break
      try {
        const response = await fetch(`${origin}/profile/requests`, { redirect: 'manual', signal: AbortSignal.timeout(1000) })
        if (response.status === 307) { ready = true; break }
      } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(ready, `isolated Next server did not start: ${output}`)
    const get = (path: string, role?: keyof typeof ids) => fetch(`${origin}${path}`, {
      headers: role ? { cookie: cookies[role]! } : {}, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
    assert.equal((await get(`/cafe/${slug}/request`)).status, 307)
    const cafe = await get(`/cafe/${slug}`)
    assert.equal(cafe.status, 200)
    assert.match(await cafe.text(), /درخواست رزرو میز/)
    const form = await get(`/cafe/${slug}/request`, 'customer')
    assert.equal(form.status, 200)
    assert.match(form.headers.get('cache-control') || '', /no-store/)
    const formHtml = await form.text()
    assert.match(formHtml, /ثبت درخواست به معنی رزرو قطعی میز نیست/)
    assert.match(formHtml, /لاتهٔ آزمایشی/)
    assert.equal((await get(`/admin/venue/bookings?place=${placeId}`, 'owner')).status, 200)
    assert.equal((await get(`/admin/venue/bookings?place=${placeId}`, 'staff')).status, 404)
    assert.equal((await get('/profile/requests', 'customer')).status, 200)
    if (process.env.KUCAFE_BOOKING_BROWSER_TEST === '1') {
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ headless: true })
      const customerContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } })
      await customerContext.addCookies([{ name: SESSION_COOKIE, value: cookies.customer!.split('=')[1]!, url: origin, httpOnly: true, sameSite: 'Lax' }])
      const customerPage = await customerContext.newPage()
      await customerPage.goto(`/cafe/${slug}`)
      await customerPage.locator('#page-top[data-cafe-ready="true"]').waitFor()
      assert.equal(await customerPage.getByRole('navigation', { name: 'بخش‌های کافه' }).getByRole('link').count(), 4)
      await mkdir('var/qa/mobile-miniapp', { recursive: true })
      await customerPage.screenshot({ path: 'var/qa/mobile-miniapp/booking-opt-in-overview-390.png' })
      await customerPage.getByRole('link', { name: 'درخواست رزرو میز' }).click()
      await customerPage.getByText('ثبت درخواست به معنی رزرو قطعی میز نیست').waitFor()
      await customerPage.goBack()
      await customerPage.locator('#page-top[data-cafe-screen="overview"]').waitFor()
      await customerPage.getByRole('navigation', { name: 'بخش‌های کافه' }).getByRole('link', { name: 'تجربه‌ها' }).click()
      await customerPage.getByRole('button', { name: 'ثبت تجربهٔ من' }).click()
      const reviewComposer = customerPage.getByRole('dialog', { name: 'تجربه‌ات را با دیگران شریک شو' })
      await reviewComposer.waitFor()
      await customerPage.waitForTimeout(250)
      await customerPage.screenshot({ path: 'var/qa/mobile-miniapp/review-composer-390.png' })
      await customerPage.keyboard.press('Escape')
      await reviewComposer.waitFor({ state: 'hidden' })
      for (const width of [320, 360, 390, 430, 768, 1440]) {
        await customerPage.setViewportSize({ width, height: 844 })
        await customerPage.goto(`/cafe/${slug}/request`)
        assert.equal(await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}px`)
        assert.equal(await customerPage.locator('nav[aria-label="دسترسی سریع موبایل"]').getByText('مقایسه').count(), 0,
          'request page must not inherit cafe-detail bottom actions')
      }
      const nextDay = new Date(`${tehranCivilNow().date}T00:00:00Z`)
      nextDay.setUTCDate(nextDay.getUTCDate() + 1)
      await customerPage.locator('input[name=requestedDate]').fill(nextDay.toISOString().slice(0, 10))
      await customerPage.locator('input[name=requestedLocalTime]').fill('15:00')
      await customerPage.locator('input[name=partySize]').fill('2')
      await customerPage.locator('main summary').filter({ hasText: 'انتخاب اقلام' }).click()
      await customerPage.locator('select:not([name])').selectOption(`${itemId}:0`)
      await customerPage.getByRole('button', { name: 'افزودن' }).click()
      await customerPage.locator('input[name=termsAccepted]').check()
      await customerPage.getByRole('button', { name: 'ارسال درخواست به کافه' }).click()
      await customerPage.getByRole('heading', { name: /در انتظار پاسخ/ }).waitFor()
      await customerPage.goto('/profile/requests')
      await customerPage.getByText('در انتظار پاسخ کافه').first().waitFor()
      const ownerContext = await browser.newContext({ baseURL: origin })
      await ownerContext.addCookies([{ name: SESSION_COOKIE, value: cookies.owner!.split('=')[1]!, url: origin, httpOnly: true, sameSite: 'Lax' }])
      const ownerPage = await ownerContext.newPage()
      await ownerPage.goto(`/admin/venue/bookings?place=${placeId}`)
      await ownerPage.getByRole('link', { name: 'بررسی درخواست' }).click()
      await ownerPage.getByText('لاتهٔ آزمایشی').waitFor()
      await ownerPage.getByRole('button', { name: 'تأیید صریح درخواست' }).click()
      await ownerPage.getByText('وضعیت درخواست ثبت شد.').waitFor()
      await customerPage.reload()
      await customerPage.getByText('تأییدشده توسط کافه').first().waitFor()
      await customerPage.goto('/profile/updates')
      await customerPage.getByText('کافه درخواست را تأیید کرد.').waitFor()
      await ownerContext.close()
      await customerContext.close()
    }
  } finally {
    await browser?.close()
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (placeId !== null) {
      const requests = await db.select({ id: bookingRequest.id }).from(bookingRequest).where(eq(bookingRequest.placeId, placeId))
      if (requests.length) {
        const bookingIds = requests.map(row => row.id)
        await db.delete(auditLog).where(and(eq(auditLog.entity, 'booking_request'), inArray(auditLog.entityId, bookingIds)))
        await db.delete(bookingItemIntent).where(inArray(bookingItemIntent.bookingId, bookingIds))
        await db.delete(bookingStatusHistory).where(inArray(bookingStatusHistory.bookingId, bookingIds))
        await db.delete(bookingRequest).where(inArray(bookingRequest.id, bookingIds))
      }
      await db.delete(venueBookingSettings).where(eq(venueBookingSettings.placeId, placeId))
      if (itemId !== null) await db.delete(menuItem).where(eq(menuItem.id, itemId))
      await db.delete(menuSection).where(eq(menuSection.placeId, placeId))
      await db.delete(auditLog).where(inArray(auditLog.actorUserId, Object.values(ids)))
      await db.delete(userPlaceRole).where(eq(userPlaceRole.placeId, placeId))
    }
    await db.delete(authSession).where(inArray(authSession.userId, Object.values(ids)))
    if (placeId !== null) await db.delete(place).where(eq(place.id, placeId))
    await db.delete(appUser).where(inArray(appUser.id, Object.values(ids)))
    await closeDb()
  }
})
