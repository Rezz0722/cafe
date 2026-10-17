import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { and, eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, authSession, eventParticipation, eventParticipationHistory, place, userPlaceRole, venueEvent } from '@/db/schema'
import { createAuthSession } from '@/core/auth/userRepo'
import { createSessionToken, SESSION_COOKIE } from '@/core/auth/session'
import { tehranCivilNow } from '@/core/booking/policy'
import { createVenueEvent, transitionVenueEvent } from './service'
import type { Session } from '@/core/auth/currentUser'

async function freePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  server.close()
  await once(server, 'close')
  return address.port
}

test('signed HTTP event discover, participate, venue response and mobile layout', {
  skip: process.env.KUCAFE_EVENT_HTTP_TEST !== '1', timeout: 150_000,
}, async () => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_booking_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { customer: randomUUID(), owner: randomUUID(), staff: randomUUID(), admin: randomUUID() }
  const slug = `qa-event-http-${suffix}`
  let placeId: number | null = null, eventId: string | null = null
  let child: ReturnType<typeof spawn> | null = null
  let browser: Awaited<ReturnType<(typeof import('playwright'))['chromium']['launch']>> | null = null
  try {
    await db.insert(appUser).values([
      { id: ids.customer, role: 'customer', name: 'QA customer', phone: '09120000007', phoneVerifiedAt: new Date() },
      { id: ids.owner, role: 'owner', name: 'QA owner' },
      { id: ids.staff, role: 'owner', name: 'QA staff' },
      { id: ids.admin, role: 'admin', name: 'QA admin' },
    ])
    const [venue] = await db.insert(place).values({ slug, name: 'کافهٔ آزمایشی رویداد', nameNormalized: 'کافه آزمایشی رویداد', status: 'published', kind: 'cafe' })
    placeId = venue.insertId
    await db.insert(userPlaceRole).values([{ userId: ids.owner, placeId, role: 'owner' }, { userId: ids.staff, placeId, role: 'staff' }])
    const session: Session = { sessionId: 'event-http', user: { id: ids.owner, name: 'QA owner', role: 'owner', phone: '', ownedPlaceSlugs: [] }, actor: null }
    const nextDay = new Date(`${tehranCivilNow().date}T00:00:00Z`)
    nextDay.setUTCDate(nextDay.getUTCDate() + 2)
    const day = nextDay.toISOString().slice(0, 10)
    const created = await createVenueEvent(session, { placeId, title: 'کارگاه آزمایشی قهوه',
      description: 'رویداد تست فقط در دیتابیس ایزوله برای بررسی سفر کاربر و کافه.',
      startDate: day, startLocalTime: '18:00', endDate: day, endLocalTime: '20:00',
      category: 'workshop', capacity: null, terms: null, participationMode: 'request', coverMediaId: null })
    eventId = created.id
    await transitionVenueEvent(session, placeId, eventId, 0, 'published', new Date(), () => {})
    const cookies: Record<string, string> = {}
    for (const [role, userId] of Object.entries(ids)) {
      const sessionId = await createAuthSession({ userId, method: 'password', expiresAt: new Date(Date.now() + 300_000) })
      cookies[role] = `${SESSION_COOKIE}=${createSessionToken({ sessionId, userId, phone: '', role: role === 'customer' ? 'customer' : role === 'admin' ? 'admin' : 'owner' })}`
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
      try { const response = await fetch(`${origin}/profile/events`, { redirect: 'manual', signal: AbortSignal.timeout(1000) }); if (response.status === 307) { ready = true; break } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.ok(ready, `isolated Next server did not start: ${output}`)
    const get = (path: string, role?: keyof typeof ids) => fetch(`${origin}${path}`, {
      headers: role ? { cookie: cookies[role]! } : {}, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    })
    const list = await get('/events')
    assert.equal(list.status, 200)
    assert.match(await list.text(), /کارگاه آزمایشی قهوه/)
    const detail = await get(`/events/${eventId}`)
    assert.equal(detail.status, 200)
    assert.match(await detail.text(), /درخواست شرکت/)
    assert.equal((await get('/profile/events')).status, 307)
    assert.equal((await get('/profile/updates')).status, 307)
    const my = await get('/profile/events', 'customer')
    assert.equal(my.status, 200)
    assert.match(my.headers.get('cache-control') || '', /no-store/)
    const updates = await get('/profile/updates', 'customer')
    assert.equal(updates.status, 200)
    assert.match(updates.headers.get('cache-control') || '', /no-store/)
    assert.match(await updates.text(), /noindex/)
    assert.equal((await get(`/admin/venue/events?place=${placeId}`, 'owner')).status, 200)
    assert.equal((await get(`/admin/venue/events?place=${placeId}`, 'staff')).status, 404)
    if (process.env.KUCAFE_EVENT_BROWSER_TEST === '1') {
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ headless: true })
      const customerContext = await browser.newContext({ baseURL: origin, viewport: { width: 390, height: 844 } })
      await customerContext.addCookies([{ name: SESSION_COOKIE, value: cookies.customer!.split('=')[1]!, url: origin, httpOnly: true, sameSite: 'Lax' }])
      const customerPage = await customerContext.newPage()
      for (const width of [320, 360, 390, 430, 768, 1440]) {
        await customerPage.setViewportSize({ width, height: 844 })
        await customerPage.goto(`/events/${eventId}`)
        assert.equal(await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `event overflow at ${width}px`)
      }
      await customerPage.locator('input[name=consent]').check()
      await customerPage.getByRole('button', { name: 'ارسال درخواست شرکت' }).click()
      await customerPage.getByRole('status').getByText('در انتظار پاسخ کافه').waitFor()
      const ownerContext = await browser.newContext({ baseURL: origin })
      await ownerContext.addCookies([{ name: SESSION_COOKIE, value: cookies.owner!.split('=')[1]!, url: origin, httpOnly: true, sameSite: 'Lax' }])
      const ownerPage = await ownerContext.newPage()
      await ownerPage.goto(`/admin/venue/events/${eventId}?place=${placeId}`)
      await ownerPage.getByRole('button', { name: 'تأیید شرکت' }).click()
      await ownerPage.getByText('تأییدشده توسط کافه').waitFor({ timeout: 15_000 })
      await customerPage.goto('/profile/events')
      await customerPage.getByText('تأییدشده توسط کافه').waitFor()
      await customerPage.goto('/profile/updates')
      await customerPage.getByText('کافه شرکت شما را تأیید کرد.').waitFor()
      for (const width of [320, 360, 390, 430, 768, 1440]) {
        await customerPage.setViewportSize({ width, height: 844 })
        assert.equal(await customerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `updates overflow at ${width}px`)
      }
      const adminContext = await browser.newContext({ baseURL: origin })
      await adminContext.addCookies([{ name: SESSION_COOKIE, value: cookies.admin!.split('=')[1]!, url: origin, httpOnly: true, sameSite: 'Lax' }])
      const adminPage = await adminContext.newPage()
      await adminPage.goto('/admin?tab=coordination')
      await adminPage.getByText('درخواست/علاقه‌مندی رویداد').waitFor({ timeout: 15_000 })
      assert.equal(await adminPage.getByText('درخواست/علاقه‌مندی رویداد').count(), 1)
      await adminContext.close()
      await ownerContext.close(); await customerContext.close()
    }
  } finally {
    await browser?.close()
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))])
      if (child.exitCode === null) child.kill('SIGKILL')
    }
    if (eventId) {
      const participants = await db.select({ id: eventParticipation.id }).from(eventParticipation).where(eq(eventParticipation.eventId, eventId))
      if (participants.length) {
        await db.delete(eventParticipationHistory).where(inArray(eventParticipationHistory.participationId, participants.map(row => row.id)))
        await db.delete(auditLog).where(and(eq(auditLog.entity, 'event_participation'), inArray(auditLog.entityId, participants.map(row => row.id))))
        await db.delete(eventParticipation).where(eq(eventParticipation.eventId, eventId))
      }
      await db.delete(auditLog).where(and(eq(auditLog.entity, 'venue_event'), eq(auditLog.entityId, eventId)))
      await db.delete(venueEvent).where(eq(venueEvent.id, eventId))
    }
    if (placeId !== null) { await db.delete(userPlaceRole).where(eq(userPlaceRole.placeId, placeId)); await db.delete(place).where(eq(place.id, placeId)) }
    await db.delete(authSession).where(inArray(authSession.userId, Object.values(ids)))
    await db.delete(appUser).where(inArray(appUser.id, Object.values(ids)))
    await closeDb()
  }
})
