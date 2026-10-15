import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb, withDbTransaction } from '@/db/client'
import { appUser, authSession, menuItem, menuSection, place, userPlaceRole } from '@/db/schema'
import { authorizeAdminRead } from '@/core/admin/permissionRead'
import { buildMenuExport } from '@/core/places/menuExport'
import { createMenuExportResponse } from '@/core/places/menuExportResponse'
import { loadOwnerPlace } from '@/core/places/manage'
import { listQrChannels } from '@/core/qr/channels'
import { getMenuStats } from '@/core/analytics/menuStats'
import { previewVenueMenuImport } from '@/core/import/venueMenuImport'
import { SESSION_SECRET } from '@/core/config/env'
import { createSessionToken } from './session'
import { resolveSessionTokens } from './sessionResolver'
import { authorizeVenueSession } from './venueAccess'
import { createAuthSession, findUserById } from './userRepo'
import { signClaims } from './token'
import type { ViewAsClaims } from './impersonation'

test('signed sessions enforce live branch roles and protect owner exports in MariaDB', {
  skip: process.env.KUCAFE_AUTHZ_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_authz_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
  'Disposable database required; production forbidden')
  assert.ok(SESSION_SECRET.length >= 32)

  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ids = Object.fromEntries(['admin', 'owner', 'manager', 'staff', 'stranger', 'blocked', 'temporary', 'expired']
    .map(role => [role, randomUUID()])) as Record<string, string>
  const allUserIds = Object.values(ids)
  const placeIds: number[] = []
  const sessions: Record<string, string> = {}

  try {
    await db.insert(appUser).values(Object.entries(ids).map(([role, id]) => ({
      id,
      name: `QA ${role}`,
      role: role === 'admin' ? 'admin' as const : 'owner' as const,
      status: role === 'blocked' ? 'blocked' as const : 'active' as const,
      mustChangePassword: role === 'temporary',
    })))
    for (const branch of ['owned', 'foreign']) {
      const [row] = await db.insert(place).values({
        slug: `qa-authz-${suffix}-${branch}`, name: `QA ${branch}`,
        nameNormalized: `QA ${branch}`, status: 'published',
      })
      placeIds.push(row.insertId)
    }
    const own = placeIds[0]!, foreign = placeIds[1]!
    await db.insert(userPlaceRole).values([
      { userId: ids.owner!, placeId: own, role: 'owner' },
      { userId: ids.manager!, placeId: own, role: 'manager' },
      { userId: ids.staff!, placeId: own, role: 'staff' },
      { userId: ids.stranger!, placeId: foreign, role: 'owner' },
      { userId: ids.temporary!, placeId: own, role: 'owner' },
      { userId: ids.expired!, placeId: own, role: 'owner' },
    ])
    const [ownedSection] = await db.insert(menuSection).values({ placeId: own, name: 'قهوه', branchScope: 'branch', sortOrder: 0 })
    const [foreignSection] = await db.insert(menuSection).values({ placeId: foreign, name: 'خصوصی', branchScope: 'branch', sortOrder: 0 })
    await db.insert(menuItem).values([
      { placeId: own, sectionId: ownedSection.insertId, publicId: `qaauthz_${suffix}_0`, name: 'اسپرسو', nameNormalized: 'اسپرسو', price: 100000 },
      { placeId: foreign, sectionId: foreignSection.insertId, publicId: `qaauthz_${suffix}_1`, name: 'Foreign secret', nameNormalized: 'Foreign secret', price: 200000 },
    ])

    for (const [role, userId] of Object.entries(ids)) {
      const expiresAt = new Date(Date.now() + (role === 'expired' ? -60_000 : 60_000))
      const sessionId = await createAuthSession({ userId, method: 'password', expiresAt })
      sessions[role] = createSessionToken({ sessionId, userId, phone: '', role: role === 'admin' ? 'admin' : 'owner' })
    }
    const resolved = async (role: string, viewAsToken?: string) => resolveSessionTokens(sessions[role], viewAsToken)

    await t.test('valid owner, manager and administrator can write; staff, foreign and tampered IDs cannot', async () => {
      assert.equal((await authorizeVenueSession(await resolved('owner'), own)).ok, true)
      assert.equal((await authorizeVenueSession(await resolved('manager'), own)).ok, true)
      assert.equal((await authorizeVenueSession(await resolved('admin'), foreign)).ok, true)
      for (const role of ['staff', 'stranger']) assert.equal((await authorizeVenueSession(await resolved(role), own)).ok, false, role)
      assert.equal((await authorizeVenueSession(await resolved('owner'), foreign)).ok, false)
      assert.equal((await authorizeVenueSession(await resolved('owner'), 0)).ok, false)
      assert.equal((await authorizeVenueSession(await resolved('owner'), Number.MAX_SAFE_INTEGER + 1)).ok, false)
      assert.deepEqual((await findUserById(ids.staff!))?.ownedPlaces, [])
      const [foreignItem] = await db.select({ placeId: menuItem.placeId, price: menuItem.price })
        .from(menuItem).where(eq(menuItem.publicId, `qaauthz_${suffix}_1`)).limit(1)
      assert.equal(foreignItem?.placeId, foreign)
      assert.equal((await authorizeVenueSession(await resolved('owner'), foreignItem!.placeId)).ok, false)
      assert.equal(foreignItem?.price, 200000)
    })

    await t.test('revoked role, blocked account, expired session and temporary-password account fail live checks', async () => {
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(eq(userPlaceRole.userId, ids.owner!))
      assert.equal((await authorizeVenueSession(await resolved('owner'), own)).ok, false)
      assert.equal((await authorizeAdminRead(await resolved('owner'), own, true)).ok, false)
      await db.update(userPlaceRole).set({ status: 'active' }).where(eq(userPlaceRole.userId, ids.owner!))
      assert.equal((await resolved('blocked')).user, null)
      assert.equal((await resolved('expired')).user, null)
      assert.equal((await authorizeVenueSession(await resolved('temporary'), own)).ok, false)
      assert.equal((await authorizeAdminRead(await resolved('temporary'), own, true)).ok, false)
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, ids.owner!))
      assert.equal((await resolved('owner')).user, null)
      await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, ids.owner!))
    })

    await t.test('signed view-as cannot write or export even when administrator views owner', async () => {
      const viewAsToken = signClaims<ViewAsClaims>({ actorId: ids.admin!, targetId: ids.owner!, exp: Math.floor(Date.now() / 1000) + 300 }, SESSION_SECRET)
      const impersonated = await resolved('admin', viewAsToken)
      assert.equal(impersonated.user?.id, ids.owner)
      assert.equal(impersonated.actor?.id, ids.admin)
      assert.equal((await authorizeVenueSession(impersonated, own)).ok, false)
      assert.equal((await authorizeAdminRead(impersonated, own, true)).ok, false)
    })

    await t.test('P1-03 JSON and Excel CSV exports use authorized signed sessions and remain branch-scoped', async () => {
      for (const role of ['owner', 'admin']) {
        const access = await authorizeAdminRead(await resolved(role), own, true)
        assert.equal(access.ok, true)
        const snapshot = await withDbTransaction(() => loadOwnerPlace(own))
        assert.ok(snapshot)
        const data = buildMenuExport(snapshot, new Date('2026-10-15T00:00:00Z'))
        for (const format of ['json', 'csv'] as const) {
          const response = createMenuExportResponse(data, own, format)
          const raw = new Uint8Array(await response.arrayBuffer())
          const body = new TextDecoder().decode(raw)
          assert.equal(response.status, 200)
          assert.match(response.headers.get('content-disposition') || '', new RegExp(`\\.${format}"`))
          assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
          assert.ok(body.includes('اسپرسو'))
          assert.ok(!body.includes('Foreign secret'))
          if (format === 'csv') assert.deepEqual(Array.from(raw.slice(0, 3)), [0xef, 0xbb, 0xbf])
        }
      }
      for (const role of ['manager', 'staff', 'stranger']) assert.equal((await authorizeAdminRead(await resolved(role), own, true)).ok, false, role)
      assert.equal((await authorizeAdminRead(await resolved('owner'), foreign, true)).ok, false)
    })

    await t.test('secondary QR, statistics and import services reject staff and foreign actors', async () => {
      const staffActor = { userId: ids.staff!, label: 'QA staff' }
      const foreignActor = { userId: ids.stranger!, label: 'QA foreign' }
      await assert.rejects(listQrChannels(own, staffActor))
      await assert.rejects(getMenuStats(own, staffActor, true))
      await assert.rejects(previewVenueMenuImport({ placeId: own, sectionId: ownedSection.insertId, revision: '0', text: 'نام,قیمت\nتست,10000', delimiter: ',' }, staffActor, SESSION_SECRET))
      await assert.rejects(listQrChannels(own, foreignActor))
      assert.deepEqual(await listQrChannels(own, { userId: ids.manager!, label: 'QA manager' }), [])
    })
  } finally {
    if (placeIds.length) {
      await db.delete(menuItem).where(inArray(menuItem.placeId, placeIds))
      await db.delete(menuSection).where(inArray(menuSection.placeId, placeIds))
      await db.delete(userPlaceRole).where(inArray(userPlaceRole.placeId, placeIds))
    }
    await db.delete(authSession).where(inArray(authSession.userId, allUserIds))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await db.delete(appUser).where(inArray(appUser.id, allUserIds))
    await closeDb()
  }
})
