import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, menuItem, menuItemFieldOverride, menuSection, place, userPlaceRole } from '@/db/schema'
import { applyMenuBatch, previewMenuBatch, type MenuBatchInput } from './menuBatch'

test('P2-01 batch menu uses signed read-only preview and atomic branch-scoped apply', {
  skip: process.env.KUCAFE_MENU_BATCH_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_menu_import_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
    'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const owner = randomUUID(), manager = randomUUID(), admin = randomUUID(), staff = randomUUID(), foreign = randomUUID()
  const actors = { owner: { userId: owner, label: 'QA owner' }, manager: { userId: manager, label: 'QA manager' },
    admin: { userId: admin, label: 'QA admin' }, staff: { userId: staff, label: 'QA staff' }, foreign: { userId: foreign, label: 'QA foreign' } }
  const userIds = Object.values(actors).map(actor => actor.userId)
  const placeIds: number[] = [], sectionIds: number[] = [], itemIds: number[] = []
  const secret = `test-only-${randomUUID()}`, trigger = `qa_batch_${suffix}`
  try {
    await db.insert(appUser).values([
      { id: owner, name: 'QA owner', role: 'owner' }, { id: manager, name: 'QA manager', role: 'owner' },
      { id: admin, name: 'QA admin', role: 'admin' }, { id: staff, name: 'QA staff', role: 'owner' },
      { id: foreign, name: 'QA foreign', role: 'owner' },
    ])
    for (const label of ['a', 'b']) {
      const [inserted] = await db.insert(place).values({ slug: `qa-batch-${suffix}-${label}`, name: `QA ${label}`, nameNormalized: `QA ${label}`, status: 'published' })
      placeIds.push(inserted.insertId)
    }
    await db.insert(userPlaceRole).values([
      { userId: owner, placeId: placeIds[0]!, role: 'owner' },
      { userId: manager, placeId: placeIds[0]!, role: 'manager' },
      { userId: staff, placeId: placeIds[0]!, role: 'staff' },
      { userId: foreign, placeId: placeIds[1]!, role: 'owner' },
    ])
    for (const [placeId, scope] of [[placeIds[0]!, 'branch'], [placeIds[0]!, 'unverified'], [placeIds[1]!, 'branch']] as const) {
      const [inserted] = await db.insert(menuSection).values({ placeId, name: `QA ${scope}`, branchScope: scope })
      sectionIds.push(inserted.insertId)
    }
    for (const [sectionId, placeId, label] of [[sectionIds[0]!, placeIds[0]!, 'a'], [sectionIds[0]!, placeIds[0]!, 'b'],
      [sectionIds[1]!, placeIds[0]!, 'quarantine'], [sectionIds[2]!, placeIds[1]!, 'foreign']] as const) {
      const [inserted] = await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa-batch-${suffix}-${label}`,
        name: `QA ${label}`, nameNormalized: `QA ${label}`, price: 100000, priceUpdatedAt: new Date('2025-01-01T00:00:00Z') })
      itemIds.push(inserted.insertId)
    }
    const input: MenuBatchInput = { placeId: placeIds[0]!, revision: '0', operation: 'unavailable', itemIds: itemIds.slice(0, 2) }
    const before = await db.select().from(menuItem).where(inArray(menuItem.id, itemIds))
    const preview = await previewMenuBatch(input, actors.owner, secret)
    await t.test('preview has no writes, counts changes and rejects foreign or quarantined IDs', async () => {
      assert.equal(preview.changedCount, 2)
      assert.equal(preview.rejectedCount, 0)
      assert.deepEqual(await db.select().from(menuItem).where(inArray(menuItem.id, itemIds)), before)
      const rejected = await previewMenuBatch({ ...input, itemIds: [itemIds[0]!, itemIds[2]!, itemIds[3]!] }, actors.owner, secret)
      assert.equal(rejected.rejectedCount, 2)
      await assert.rejects(applyMenuBatch({ ...input, itemIds: [itemIds[0]!, itemIds[2]!] }, actors.owner, rejected.token, secret))
      await assert.rejects(previewMenuBatch({ ...input, itemIds: Array.from({ length: 101 }, (_, index) => index + 1) }, actors.owner, secret))
    })
    await t.test('staff, foreign owner, view-as, blocked and revoked users cannot apply', async () => {
      await assert.rejects(previewMenuBatch(input, actors.staff, secret))
      await assert.rejects(previewMenuBatch(input, actors.foreign, secret))
      await assert.rejects(previewMenuBatch(input, { ...actors.admin, onBehalfOf: owner }, secret))
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, owner))
      await assert.rejects(applyMenuBatch(input, actors.owner, preview.token, secret))
      await db.update(appUser).set({ status: 'active' }).where(eq(appUser.id, owner))
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(and(eq(userPlaceRole.userId, owner), eq(userPlaceRole.placeId, placeIds[0]!)))
      await assert.rejects(applyMenuBatch(input, actors.owner, preview.token, secret))
      await db.update(userPlaceRole).set({ status: 'active' }).where(and(eq(userPlaceRole.userId, owner), eq(userPlaceRole.placeId, placeIds[0]!)))
    })
    await t.test('tampering, expiry and item changes between preview/apply fail closed', async () => {
      await assert.rejects(applyMenuBatch({ ...input, operation: 'archive' }, actors.owner, preview.token, secret))
      await assert.rejects(applyMenuBatch(input, actors.manager, preview.token, secret))
      await assert.rejects(applyMenuBatch(input, actors.owner, preview.token, secret, Date.now() + 11 * 60_000))
      await db.update(menuItem).set({ featured: true }).where(eq(menuItem.id, itemIds[0]!))
      await assert.rejects(applyMenuBatch(input, actors.owner, preview.token, secret))
      await db.update(menuItem).set({ featured: false }).where(eq(menuItem.id, itemIds[0]!))
    })
    await t.test('one apply succeeds, replay/stale revision fails, price timestamps and foreign rows stay intact', async () => {
      const results = await Promise.allSettled([
        applyMenuBatch(input, actors.owner, preview.token, secret),
        applyMenuBatch(input, actors.owner, preview.token, secret),
      ])
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
      const rows = await db.select().from(menuItem).where(inArray(menuItem.id, itemIds))
      assert.equal(rows[0]!.available, false)
      assert.equal(rows[1]!.available, false)
      assert.equal(rows[2]!.available, true)
      assert.equal(rows[3]!.available, true)
      for (let i = 0; i < rows.length; i++) {
        assert.equal(rows[i]!.price, before[i]!.price)
        assert.equal(rows[i]!.priceUpdatedAt?.toISOString(), before[i]!.priceUpdatedAt?.toISOString())
      }
      const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, placeIds[0]!))
      assert.equal(venue!.revision, 1)
      assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.actorUserId, owner), eq(auditLog.action, 'menu.batch.unavailable')))).length, 1)
      assert.equal((await db.select().from(menuItemFieldOverride).where(inArray(menuItemFieldOverride.itemId, itemIds.slice(0, 2)))).length, 2)
    })
    await t.test('manager/admin allowed, archived item restores; audit failure rolls back atomically', async () => {
      const managerInput: MenuBatchInput = { ...input, revision: '1', operation: 'feature' }
      const managerPreview = await previewMenuBatch(managerInput, actors.manager, secret)
      await applyMenuBatch(managerInput, actors.manager, managerPreview.token, secret)
      const adminInput: MenuBatchInput = { ...input, revision: '2', operation: 'archive' }
      const adminPreview = await previewMenuBatch(adminInput, actors.admin, secret)
      await applyMenuBatch(adminInput, actors.admin, adminPreview.token, secret)
      const restoreInput: MenuBatchInput = { ...input, revision: '3', operation: 'restore' }
      const restorePreview = await previewMenuBatch(restoreInput, actors.owner, secret)
      await applyMenuBatch(restoreInput, actors.owner, restorePreview.token, secret)
      const failingInput: MenuBatchInput = { ...input, revision: '4', operation: 'available' }
      const failingPreview = await previewMenuBatch(failingInput, actors.owner, secret)
      const snapshot = await db.select().from(menuItem).where(inArray(menuItem.id, itemIds))
      await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'menu.batch.available' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA rollback'; END IF; END`))
      try {
        await assert.rejects(applyMenuBatch(failingInput, actors.owner, failingPreview.token, secret))
        assert.deepEqual(await db.select().from(menuItem).where(inArray(menuItem.id, itemIds)), snapshot)
        const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, placeIds[0]!))
        assert.equal(venue!.revision, 4)
      } finally { await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)) }
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))
    await db.delete(auditLog).where(inArray(auditLog.actorUserId, userIds))
    if (itemIds.length) await db.delete(menuItem).where(inArray(menuItem.id, itemIds))
    if (sectionIds.length) await db.delete(menuSection).where(inArray(menuSection.id, sectionIds))
    if (placeIds.length) await db.delete(place).where(inArray(place.id, placeIds))
    await db.delete(appUser).where(inArray(appUser.id, userIds))
    await closeDb()
  }
})
