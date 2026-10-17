import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, eventParticipation, eventParticipationHistory, place, userPlaceRole, venueEvent } from '@/db/schema'
import type { Session } from '@/core/auth/currentUser'
import { tehranCivilNow } from '@/core/booking/policy'
import { getCoordinationMetrics } from '@/core/booking/insights'
import { listMyAccountUpdates } from '@/core/notifications/feed'
import type { EventDraft } from './policy'
import { cancelMyEventParticipation, createVenueEvent, getPublicEvent, getVenueEvent,
  listMyEventParticipations, listUpcomingPublicEvents, listVenueEventParticipations, listVenueEvents,
  requestEventParticipation, respondToEventParticipation, transitionVenueEvent, updateDraftVenueEvent } from './service'

test('P2-05 event publishing and participation are branch-scoped and explicit', {
  skip: process.env.KUCAFE_EVENT_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_booking_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { customer: randomUUID(), second: randomUUID(), owner: randomUUID(), manager: randomUUID(), staff: randomUUID(), admin: randomUUID(), outsider: randomUUID() }
  const placeIds: number[] = [], eventIds: string[] = [], triggerName = `qa_event_${suffix}`
  const session = (name: keyof typeof ids, role: 'customer' | 'owner' | 'admin' = name === 'admin' ? 'admin' : name === 'customer' || name === 'second' ? 'customer' : 'owner', viewAs = false): Session => ({
    sessionId: 'disposable-event-test', user: { id: ids[name], name, role, phone: '', ownedPlaceSlugs: [] },
    actor: viewAs ? { id: ids.admin, name: 'admin', role: 'admin', phone: '', ownedPlaceSlugs: [] } : null,
  })
  const owner = session('owner'), manager = session('manager'), staff = session('staff'), admin = session('admin')
  const customer = session('customer'), second = session('second')
  const start = new Date(`${tehranCivilNow().date}T00:00:00Z`)
  const noInvalidate = () => {}
  start.setUTCDate(start.getUTCDate() + 2)
  const date = start.toISOString().slice(0, 10)
  const draft = (placeId: number, mode: 'request' | 'interest' = 'request'): EventDraft => ({
    placeId, title: 'شب موسیقی آزمایشی', description: 'یک رویداد واقعی‌نما فقط برای آزمون در پایگاه‌دادهٔ ایزوله.',
    startDate: date, startLocalTime: '18:00', endDate: date, endLocalTime: '20:00',
    category: 'music', capacity: null, terms: 'بدون فروش بلیت', participationMode: mode, coverMediaId: null,
  })
  try {
    await db.insert(appUser).values([
      { id: ids.customer, name: 'QA customer', role: 'customer', phone: '09120000004', phoneVerifiedAt: new Date() },
      { id: ids.second, name: 'QA second', role: 'customer', phone: '09120000005', phoneVerifiedAt: new Date() },
      { id: ids.owner, name: 'QA owner', role: 'owner' },
      { id: ids.manager, name: 'QA manager', role: 'owner' },
      { id: ids.staff, name: 'QA staff', role: 'owner' },
      { id: ids.admin, name: 'QA admin', role: 'admin' },
      { id: ids.outsider, name: 'QA outsider', role: 'owner' },
    ])
    for (const label of ['owned', 'foreign']) {
      const [row] = await db.insert(place).values({ slug: `qa-event-${suffix}-${label}`, name: `QA ${label}`,
        nameNormalized: `QA ${label}`, kind: 'cafe', status: 'published', lastVerifiedAt: new Date('2026-01-01T00:00:00Z') })
      placeIds.push(row.insertId)
    }
    await db.insert(userPlaceRole).values([
      { userId: ids.owner, placeId: placeIds[0]!, role: 'owner' },
      { userId: ids.manager, placeId: placeIds[0]!, role: 'manager' },
      { userId: ids.staff, placeId: placeIds[0]!, role: 'staff' },
      { userId: ids.outsider, placeId: placeIds[1]!, role: 'owner' },
    ])
    const beforeVerified = (await db.select({ value: place.lastVerifiedAt }).from(place).where(eq(place.id, placeIds[0]!)))[0]!.value
    await t.test('draft, explicit publish, public visibility and owner RBAC', async () => {
      await assert.rejects(createVenueEvent(staff, draft(placeIds[0]!)))
      await assert.rejects(createVenueEvent(owner, draft(placeIds[1]!)))
      await assert.rejects(createVenueEvent(session('admin', 'admin', true), draft(placeIds[0]!)))
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(and(eq(userPlaceRole.userId, ids.manager), eq(userPlaceRole.placeId, placeIds[0]!)))
      await assert.rejects(createVenueEvent(manager, draft(placeIds[0]!)))
      await db.update(userPlaceRole).set({ status: 'active' }).where(and(eq(userPlaceRole.userId, ids.manager), eq(userPlaceRole.placeId, placeIds[0]!)))
      const created = await createVenueEvent(owner, draft(placeIds[0]!))
      eventIds.push(created.id)
      assert.equal(await getPublicEvent(created.id), null)
      assert.equal((await listVenueEvents(manager, placeIds[0]!)).length, 1)
      assert.equal((await listVenueEvents(session('owner', 'owner', true), placeIds[0]!)).length, 1)
      await assert.rejects(listVenueEvents(staff, placeIds[0]!))
      await assert.rejects(getVenueEvent(owner, placeIds[1]!, created.id))
      await assert.rejects(updateDraftVenueEvent(staff, created.id, 0, draft(placeIds[0]!)))
      assert.equal((await updateDraftVenueEvent(manager, created.id, 0, { ...draft(placeIds[0]!), title: 'شب موسیقی با اجرای کافه' })).revision, 1)
      await assert.rejects(transitionVenueEvent(owner, placeIds[0]!, created.id, 0, 'published', new Date(), noInvalidate))
      assert.equal((await transitionVenueEvent(owner, placeIds[0]!, created.id, 1, 'published', new Date(), noInvalidate)).status, 'published')
      assert.equal((await getPublicEvent(created.id))?.event.status, 'published')
      assert.ok((await listUpcomingPublicEvents()).some(row => row.event.id === created.id))
      await assert.rejects(transitionVenueEvent(owner, placeIds[0]!, created.id, 2, 'published', new Date(), noInvalidate))
    })
    await t.test('customer interest/request, duplicate, scoped response and cancellation', async () => {
      const id = eventIds[0]!
      await assert.rejects(requestEventParticipation(session('customer', 'customer', true), id))
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, ids.customer))
      await assert.rejects(requestEventParticipation(customer, id))
      await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, ids.customer))
      await db.update(appUser).set({ phoneVerifiedAt: null }).where(eq(appUser.id, ids.customer))
      await assert.rejects(requestEventParticipation(customer, id))
      await db.update(appUser).set({ phoneVerifiedAt: new Date() }).where(eq(appUser.id, ids.customer))
      const pending = await requestEventParticipation(customer, id, 'مایل به شرکت هستم.')
      assert.equal(pending.status, 'pending')
      assert.equal((await requestEventParticipation(customer, id)).id, pending.id)
      assert.equal((await listMyEventParticipations(customer)).length, 1)
      assert.equal((await listVenueEventParticipations(manager, placeIds[0]!, id)).length, 1)
      await assert.rejects(listVenueEventParticipations(staff, placeIds[0]!, id))
      await assert.rejects(listVenueEventParticipations(owner, placeIds[1]!, id))
      await assert.rejects(respondToEventParticipation(staff, placeIds[0]!, pending.id, 0, 'confirmed'))
      await assert.rejects(respondToEventParticipation(owner, placeIds[1]!, pending.id, 0, 'confirmed'))
      const results = await Promise.allSettled([
        respondToEventParticipation(owner, placeIds[0]!, pending.id, 0, 'confirmed', 'منتظر شما هستیم.'),
        respondToEventParticipation(manager, placeIds[0]!, pending.id, 0, 'rejected', 'ظرفیت هماهنگی نداریم.'),
      ])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      assert.equal(results.filter(result => result.status === 'rejected').length, 1)
      const [saved] = await db.select().from(eventParticipation).where(eq(eventParticipation.id, pending.id))
      assert.equal(saved?.revision, 1)
      if (saved?.status === 'confirmed') {
        assert.equal((await cancelMyEventParticipation(customer, pending.id, 1)).status, 'cancelled')
      } else {
        assert.equal(saved?.status, 'rejected')
        await assert.rejects(cancelMyEventParticipation(customer, pending.id, 1))
      }
      await assert.rejects(cancelMyEventParticipation(second, pending.id, 2))
      const interestEvent = await createVenueEvent(admin, draft(placeIds[0]!, 'interest'))
      eventIds.push(interestEvent.id)
      await transitionVenueEvent(admin, placeIds[0]!, interestEvent.id, 0, 'published', new Date(), noInvalidate)
      assert.equal((await requestEventParticipation(second, interestEvent.id)).status, 'interested')
      await transitionVenueEvent(owner, placeIds[0]!, interestEvent.id, 1, 'cancelled', new Date(), noInvalidate)
      assert.equal((await getPublicEvent(interestEvent.id))?.event.status, 'cancelled')
      assert.ok(!(await listUpcomingPublicEvents()).some(row => row.event.id === interestEvent.id))
    })
    await t.test('private updates and aggregate-only admin metrics', async () => {
      const customerUpdates = await listMyAccountUpdates(customer)
      assert.ok(customerUpdates.some(update => update.detail === 'درخواست شرکت لغو شد.' || update.detail === 'کافه درخواست شرکت را رد کرد.'))
      assert.ok(customerUpdates.every(update => !JSON.stringify(update).includes('09120000004')))
      const secondUpdates = await listMyAccountUpdates(second)
      assert.ok(secondUpdates.some(update => update.detail === 'کافه این رویداد را لغو کرده است.'))
      assert.ok(secondUpdates.every(update => !update.href.includes(eventIds[0]!)))
      await assert.rejects(listMyAccountUpdates(session('customer', 'customer', true)))
      await assert.rejects(listMyAccountUpdates(customer, 101))

      const metrics = await getCoordinationMetrics(admin)
      assert.ok(metrics.events.published >= 1)
      assert.ok(metrics.events.participationRequests >= 2)
      assert.ok(!JSON.stringify(metrics).includes('09120000004'))
      await assert.rejects(getCoordinationMetrics(staff))
      await assert.rejects(getCoordinationMetrics(session('admin', 'admin', true)))
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, ids.admin))
      await assert.rejects(getCoordinationMetrics(admin))
      await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, ids.admin))
    })
    await t.test('audit failure rolls back draft and historical verification remains unchanged', async () => {
      const before = (await db.select({ total: sql<number>`COUNT(*)` }).from(venueEvent))[0]!.total
      await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'event.created' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA event rollback'; END IF; END`))
      try {
        await assert.rejects(createVenueEvent(owner, draft(placeIds[0]!)))
        assert.equal((await db.select({ total: sql<number>`COUNT(*)` }).from(venueEvent))[0]!.total, before)
      } finally { await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName}`)) }
      assert.deepEqual((await db.select({ value: place.lastVerifiedAt }).from(place).where(eq(place.id, placeIds[0]!)))[0]!.value, beforeVerified)
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName}`))
    if (eventIds.length) {
      const participations = await db.select({ id: eventParticipation.id }).from(eventParticipation).where(inArray(eventParticipation.eventId, eventIds))
      if (participations.length) await db.delete(eventParticipationHistory).where(inArray(eventParticipationHistory.participationId, participations.map(row => row.id)))
      await db.delete(auditLog).where(and(eq(auditLog.entity, 'event_participation'), inArray(auditLog.entityId, participations.map(row => row.id))))
      await db.delete(eventParticipation).where(inArray(eventParticipation.eventId, eventIds))
      await db.delete(auditLog).where(and(eq(auditLog.entity, 'venue_event'), inArray(auditLog.entityId, eventIds)))
      await db.delete(venueEvent).where(inArray(venueEvent.id, eventIds))
    }
    await db.delete(userPlaceRole).where(inArray(userPlaceRole.userId, Object.values(ids)))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await db.delete(appUser).where(inArray(appUser.id, Object.values(ids)))
    await closeDb()
  }
})
