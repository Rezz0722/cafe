import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import {
  appUser, auditLog, bookingItemIntent, bookingRequest, bookingStatusHistory,
  menuItem, menuItemVariant, menuSection, place, userPlaceRole, venueBookingSettings,
} from '@/db/schema'
import type { Session } from '@/core/auth/currentUser'
import { tehranCivilNow } from './policy'
import { getCoordinationMetrics } from './insights'
import { listMyAccountUpdates } from '@/core/notifications/feed'
import {
  cancelMyBookingRequest, completeVenueBookingRequest, createBookingRequest, expireOverdueBookingRequests,
  getMyBookingRequest, getPublicBookingConfiguration, getVenueBookingRequest, listPublicBookablePlaceIds,
  getVenueBookingConfiguration, listMyBookingRequests, listVenueBookingRequests,
  respondToBookingRequest, saveVenueBookingConfiguration,
} from './service'

test('P2-05 booking core is opt-in, branch-scoped, idempotent and transactional', {
  skip: process.env.KUCAFE_BOOKING_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_booking_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = { customer: randomUUID(), foreignCustomer: randomUUID(), owner: randomUUID(), manager: randomUUID(), staff: randomUUID(), admin: randomUUID(), outsider: randomUUID() }
  const placeIds: number[] = [], itemIds: number[] = [], triggerName = `qa_booking_${suffix}`
  const session = (key: keyof typeof ids, role: 'customer' | 'owner' | 'admin' = key === 'admin' ? 'admin' : key.includes('Customer') || key === 'customer' ? 'customer' : 'owner', viewAs = false): Session => ({
    sessionId: 'disposable-test',
    user: { id: ids[key], name: key, phone: '', role, ownedPlaceSlugs: [] },
    actor: viewAs ? { id: ids.admin, name: 'admin', phone: '', role: 'admin', ownedPlaceSlugs: [] } : null,
  })
  const owner = session('owner'), manager = session('manager'), staff = session('staff'), admin = session('admin')
  const customer = session('customer'), foreignCustomer = session('foreignCustomer')
  const invalidateCafePage = () => {}
  const tomorrow = new Date(`${tehranCivilNow().date}T00:00:00Z`)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const requestedDate = tomorrow.toISOString().slice(0, 10)
  const booking = (placeId: number, items: { itemId: number; variantId?: number; quantity: number }[] = []) => ({
    placeId, kind: 'birthday' as const, requestedDate, requestedLocalTime: '15:00', partySize: 4,
    durationMinutes: 120, needsCake: true, customerNote: 'لطفاً دربارهٔ کیک هماهنگ کنید.',
    experienceSlug: 'birthday', termsAccepted: true, idempotencyKey: randomUUID(), items,
  })
  try {
    await db.insert(appUser).values([
      { id: ids.customer, name: 'QA customer', role: 'customer', phone: '09120000001', phoneVerifiedAt: new Date() },
      { id: ids.foreignCustomer, name: 'QA foreign', role: 'customer', phone: '09120000002', phoneVerifiedAt: new Date() },
      { id: ids.owner, name: 'QA owner', role: 'owner' },
      { id: ids.manager, name: 'QA manager', role: 'owner' },
      { id: ids.staff, name: 'QA staff', role: 'owner' },
      { id: ids.admin, name: 'QA admin', role: 'admin' },
      { id: ids.outsider, name: 'QA outsider', role: 'owner' },
    ])
    for (const label of ['owned', 'foreign']) {
      const [row] = await db.insert(place).values({ slug: `qa-booking-${suffix}-${label}`, name: `QA ${label}`,
        nameNormalized: `QA ${label}`, kind: 'cafe', status: 'published', lastVerifiedAt: new Date('2026-01-01T00:00:00Z') })
      placeIds.push(row.insertId)
    }
    await db.insert(userPlaceRole).values([
      { userId: ids.owner, placeId: placeIds[0]!, role: 'owner' },
      { userId: ids.manager, placeId: placeIds[0]!, role: 'manager' },
      { userId: ids.staff, placeId: placeIds[0]!, role: 'staff' },
      { userId: ids.outsider, placeId: placeIds[1]!, role: 'owner' },
    ])
    const [section] = await db.insert(menuSection).values({ placeId: placeIds[0]!, name: 'نوشیدنی', branchScope: 'branch' })
    const [foreignSection] = await db.insert(menuSection).values({ placeId: placeIds[1]!, name: 'نوشیدنی', branchScope: 'branch' })
    for (const [sectionId, placeId, label, price] of [
      [section.insertId, placeIds[0]!, 'لاته', 100000],
      [section.insertId, placeIds[0]!, 'آب', 0],
      [foreignSection.insertId, placeIds[1]!, 'قهوهٔ بیگانه', 90000],
    ] as const) {
      const [row] = await db.insert(menuItem).values({ publicId: `qa-booking-${suffix}-${itemIds.length}`, placeId,
        sectionId, name: label, nameNormalized: label, price, available: true, priceUpdatedAt: new Date('2026-01-01T00:00:00Z') })
      itemIds.push(row.insertId)
    }
    const [variant] = await db.insert(menuItemVariant).values({ itemId: itemIds[0]!, label: 'بزرگ', price: 150000, available: true })
    const menuBefore = await db.select({ id: menuItem.id, price: menuItem.price, priceUpdatedAt: menuItem.priceUpdatedAt })
      .from(menuItem).where(inArray(menuItem.id, itemIds))
    const placeBefore = await db.select({ id: place.id, verified: place.lastVerifiedAt }).from(place).where(inArray(place.id, placeIds))

    await t.test('no opt-in means no public CTA, no create and no staff/view-as settings', async () => {
      assert.equal(await getPublicBookingConfiguration(placeIds[0]!), null)
      await assert.rejects(createBookingRequest(customer, booking(placeIds[0]!)))
      await assert.rejects(saveVenueBookingConfiguration(staff, placeIds[0]!, 0, { enabled: true, requestFrom: '09:00', requestUntil: '22:00', maxPartySize: 10, minNoticeMinutes: 60, maxAdvanceDays: 30, instructions: null }, invalidateCafePage))
      await assert.rejects(saveVenueBookingConfiguration(session('admin', 'admin', true), placeIds[0]!, 0, { enabled: true, requestFrom: '09:00', requestUntil: '22:00', maxPartySize: 10, minNoticeMinutes: 60, maxAdvanceDays: 30, instructions: null }, invalidateCafePage))
      await assert.rejects(saveVenueBookingConfiguration(owner, placeIds[1]!, 0, { enabled: true, requestFrom: '09:00', requestUntil: '22:00', maxPartySize: 10, minNoticeMinutes: 60, maxAdvanceDays: 30, instructions: null }, invalidateCafePage))
      const saved = await saveVenueBookingConfiguration(owner, placeIds[0]!, 0, { enabled: true, requestFrom: '09:00', requestUntil: '22:00', maxPartySize: 10, minNoticeMinutes: 60, maxAdvanceDays: 30, instructions: 'پاسخ از پنل داده می‌شود' }, invalidateCafePage)
      assert.equal(saved.revision, 1)
      assert.ok(await getPublicBookingConfiguration(placeIds[0]!))
      assert.equal(await getPublicBookingConfiguration(placeIds[1]!), null)
      assert.deepEqual([...await listPublicBookablePlaceIds(placeIds)], [placeIds[0]])
      assert.equal((await getVenueBookingConfiguration(manager, placeIds[0]!))?.enabled, true)
      await assert.rejects(saveVenueBookingConfiguration(owner, placeIds[0]!, 0, { ...saved, enabled: false }, invalidateCafePage))
    })

    await t.test('customer request snapshots valid same-branch menu, retries once, and isolates private reads', async () => {
      const input = booking(placeIds[0]!, [{ itemId: itemIds[0]!, variantId: variant.insertId, quantity: 2 }, { itemId: itemIds[1]!, quantity: 1 }])
      const created = await createBookingRequest(customer, input)
      assert.equal(created.status, 'pending')
      assert.equal(created.repeated, false)
      const repeated = await createBookingRequest(customer, input)
      assert.equal(repeated.id, created.id)
      assert.equal(repeated.repeated, true)
      const settings = await getVenueBookingConfiguration(owner, placeIds[0]!)
      assert.ok(settings)
      const { revision: settingsRevision, ...settingsValues } = settings
      await saveVenueBookingConfiguration(owner, placeIds[0]!, settingsRevision, { ...settingsValues, enabled: false }, invalidateCafePage)
      assert.equal((await createBookingRequest(customer, input)).id, created.id, 'retry survives later opt-out')
      await saveVenueBookingConfiguration(owner, placeIds[0]!, settingsRevision + 1, { ...settingsValues, enabled: true }, invalidateCafePage)
      await assert.rejects(createBookingRequest(customer, { ...input, partySize: 5 }))
      await assert.rejects(createBookingRequest(customer, booking(placeIds[0]!)), /درخواست دیگری/)
      assert.equal(await getMyBookingRequest(foreignCustomer, created.id), null)
      await assert.rejects(cancelMyBookingRequest(foreignCustomer, created.id, 0))
      const own = await getMyBookingRequest(customer, created.id)
      assert.ok(own)
      assert.deepEqual(own.items.map(row => [row.itemName, row.variantName, row.unitPriceToman, row.quantity]),
        [['لاته', 'بزرگ', 150000, 2], ['آب', null, 0, 1]])
      assert.equal((await listMyBookingRequests(customer)).length, 1)
      await assert.rejects(createBookingRequest(customer, { ...booking(placeIds[0]!, [{ itemId: itemIds[2]!, quantity: 1 }]), requestedLocalTime: '16:00' }))
      assert.equal((await db.select().from(bookingRequest).where(eq(bookingRequest.requesterUserId, ids.customer))).length, 1)
      await assert.rejects(listVenueBookingRequests(staff, placeIds[0]!))
      await assert.rejects(listVenueBookingRequests(owner, placeIds[1]!))
      assert.equal((await listVenueBookingRequests(manager, placeIds[0]!)).length, 1)
      assert.equal((await listVenueBookingRequests(admin, placeIds[0]!)).length, 1)
      assert.equal((await listVenueBookingRequests(session('owner', 'owner', true), placeIds[0]!)).length, 1)
      await assert.rejects(listVenueBookingRequests(session('staff', 'owner', true), placeIds[0]!))
      assert.equal((await getVenueBookingRequest(manager, placeIds[0]!, created.id))?.items.length, 2)
      await assert.rejects(getVenueBookingRequest(owner, placeIds[1]!, created.id))
      await assert.rejects(getVenueBookingRequest(staff, placeIds[0]!, created.id))
      const menuAfter = await db.select({ id: menuItem.id, price: menuItem.price, priceUpdatedAt: menuItem.priceUpdatedAt })
        .from(menuItem).where(inArray(menuItem.id, itemIds))
      const placeAfter = await db.select({ id: place.id, verified: place.lastVerifiedAt }).from(place).where(inArray(place.id, placeIds))
      assert.deepEqual(menuAfter, menuBefore)
      assert.deepEqual(placeAfter, placeBefore)
    })

    await t.test('only one of two concurrent venue responses wins; staff, revoked and view-as denied', async () => {
      const [first] = await db.select().from(bookingRequest).where(eq(bookingRequest.requesterUserId, ids.customer))
      assert.ok(first)
      await assert.rejects(respondToBookingRequest(staff, placeIds[0]!, first.id, 0, 'confirmed'))
      await assert.rejects(respondToBookingRequest(owner, placeIds[1]!, first.id, 0, 'confirmed'))
      await assert.rejects(respondToBookingRequest(session('admin', 'admin', true), placeIds[0]!, first.id, 0, 'confirmed'))
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(and(eq(userPlaceRole.userId, ids.manager), eq(userPlaceRole.placeId, placeIds[0]!)))
      await assert.rejects(respondToBookingRequest(manager, placeIds[0]!, first.id, 0, 'confirmed'))
      await db.update(userPlaceRole).set({ status: 'active' }).where(and(eq(userPlaceRole.userId, ids.manager), eq(userPlaceRole.placeId, placeIds[0]!)))
      const results = await Promise.allSettled([
        respondToBookingRequest(owner, placeIds[0]!, first.id, 0, 'confirmed', 'منتظر شما هستیم.'),
        respondToBookingRequest(manager, placeIds[0]!, first.id, 0, 'rejected', 'امکان پذیرش نیست.'),
      ])
      assert.equal(results.filter(row => row.status === 'fulfilled').length, 1)
      assert.equal(results.filter(row => row.status === 'rejected').length, 1)
      const [final] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, first.id))
      assert.equal(final!.revision, 1)
      assert.ok(['confirmed', 'rejected'].includes(final!.status))
      assert.equal((await db.select().from(bookingStatusHistory).where(eq(bookingStatusHistory.bookingId, first.id))).length, 2)
      await assert.rejects(cancelMyBookingRequest(customer, first.id, 0))
    })

    await t.test('pending cancellation and injected audit failure cannot partially publish', async () => {
      const created = await createBookingRequest(customer, { ...booking(placeIds[0]!), requestedLocalTime: '17:00' })
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, ids.customer))
      await assert.rejects(cancelMyBookingRequest(customer, created.id, 0))
      await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, ids.customer))
      assert.equal((await cancelMyBookingRequest(customer, created.id, 0)).status, 'cancelled')
      await assert.rejects(cancelMyBookingRequest(customer, created.id, 1))
      const beforeCount = (await db.select({ total: sql<number>`COUNT(*)` }).from(bookingRequest))[0]!.total
      await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'booking.created' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA booking rollback'; END IF; END`))
      try {
        await assert.rejects(createBookingRequest(customer, { ...booking(placeIds[0]!, [{ itemId: itemIds[1]!, quantity: 1 }]), requestedLocalTime: '18:00' }))
        assert.equal((await db.select({ total: sql<number>`COUNT(*)` }).from(bookingRequest))[0]!.total, beforeCount)
      } finally { await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName}`)) }
    })
    await t.test('completion and expiry are explicit, never automatic confirmation', async () => {
      const confirmed = await createBookingRequest(customer, { ...booking(placeIds[0]!), requestedLocalTime: '19:00' })
      await respondToBookingRequest(owner, placeIds[0]!, confirmed.id, 0, 'confirmed', null)
      const later = new Date(tomorrow.getTime() + 2 * 86_400_000)
      assert.equal((await completeVenueBookingRequest(owner, placeIds[0]!, confirmed.id, 1, later)).status, 'completed')
      await assert.rejects(completeVenueBookingRequest(owner, placeIds[0]!, confirmed.id, 2, later))
      const pending = await createBookingRequest(customer, { ...booking(placeIds[0]!), requestedLocalTime: '20:00' })
      assert.equal((await expireOverdueBookingRequests(later)), 1)
      const [expired] = await db.select().from(bookingRequest).where(eq(bookingRequest.id, pending.id))
      assert.equal(expired?.status, 'expired')
      assert.equal((await expireOverdueBookingRequests(later)), 0)
    })
    await t.test('real booking counts and private status feed do not leak contact data', async () => {
      const metrics = await getCoordinationMetrics(admin)
      assert.ok(metrics.booking.total >= 4)
      assert.ok(metrics.byKind.some(row => row.kind === 'birthday' && row.total >= 4))
      assert.ok(metrics.byExperience.some(row => row.slug === 'birthday' && row.total >= 4))
      assert.ok(metrics.booking.averageResponseMinutes !== null)
      assert.ok(!JSON.stringify(metrics).includes('09120000001'))
      const updates = await listMyAccountUpdates(customer)
      assert.ok(updates.some(row => row.detail === 'کافه درخواست را تأیید کرد.'))
      assert.ok(updates.every(row => !JSON.stringify(row).includes('09120000001')))
      assert.equal((await listMyAccountUpdates(foreignCustomer)).length, 0)
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${triggerName}`))
    if (placeIds.length) {
      const requests = await db.select({ id: bookingRequest.id }).from(bookingRequest).where(inArray(bookingRequest.placeId, placeIds))
      if (requests.length) {
        await db.delete(auditLog).where(and(eq(auditLog.entity, 'booking_request'), inArray(auditLog.entityId, requests.map(row => row.id))))
        await db.delete(bookingItemIntent).where(inArray(bookingItemIntent.bookingId, requests.map(row => row.id)))
        await db.delete(bookingStatusHistory).where(inArray(bookingStatusHistory.bookingId, requests.map(row => row.id)))
        await db.delete(bookingRequest).where(inArray(bookingRequest.id, requests.map(row => row.id)))
      }
      await db.delete(venueBookingSettings).where(inArray(venueBookingSettings.placeId, placeIds))
      await db.delete(menuItemVariant).where(inArray(menuItemVariant.itemId, itemIds))
      await db.delete(menuItem).where(inArray(menuItem.placeId, placeIds))
      await db.delete(menuSection).where(inArray(menuSection.placeId, placeIds))
    }
    await db.delete(auditLog).where(inArray(auditLog.actorUserId, Object.values(ids)))
    await db.delete(userPlaceRole).where(inArray(userPlaceRole.userId, Object.values(ids)))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await db.delete(appUser).where(inArray(appUser.id, Object.values(ids)))
    await closeDb()
  }
})
