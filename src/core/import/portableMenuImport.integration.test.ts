import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closeDb, getDb, withDbTransaction } from '@/db/client'
import { appUser, auditLog, facet, menuItem, menuItemVariant, menuSection, place, userPlaceRole } from '@/db/schema'
import { loadOwnerPlace } from '@/core/places/manage'
import { buildMenuCsv, buildMenuExport } from '@/core/places/menuExport'
import { applyPortableImport, previewPortableImport } from './portableMenuImport'

test('P2-02 export → preview → create-only import → export is atomic and branch-scoped', {
  skip: process.env.KUCAFE_PORTABLE_IMPORT_DB_TEST !== '1',
}, async t => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_menu_import_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
    'Disposable database required; production forbidden')
  const db = getDb(), suffix = randomUUID().replaceAll('-', '').slice(0, 12), secret = `test-only-${randomUUID()}`
  const owner = randomUUID(), manager = randomUUID(), admin = randomUUID(), staff = randomUUID(), outsider = randomUUID()
  const users = [owner, manager, admin, staff, outsider], placeIds: number[] = [], sectionIds: number[] = [], itemIds: number[] = []
  const actor = { userId: owner, label: 'QA owner' }, trigger = `qa_portable_${suffix}`
  let createdFacet = false
  try {
    const [knownFacet] = await db.select({ id: facet.id }).from(facet).where(eq(facet.id, 'hot_drinks')).limit(1)
    if (!knownFacet) {
      await db.insert(facet).values({ id: 'hot_drinks', slug: 'hot-drinks', labelFa: 'نوشیدنی گرم', kind: 'drink' })
      createdFacet = true
    }
    await db.insert(appUser).values([
      { id: owner, name: 'QA owner', role: 'owner' }, { id: manager, name: 'QA manager', role: 'owner' },
      { id: admin, name: 'QA admin', role: 'admin' }, { id: staff, name: 'QA staff', role: 'owner' },
      { id: outsider, name: 'QA outsider', role: 'owner' },
    ])
    for (const label of ['source', 'target', 'csv', 'foreign']) {
      const [inserted] = await db.insert(place).values({ slug: `qa-portable-${suffix}-${label}`, name: `QA ${label}`,
        nameNormalized: `QA ${label}`, status: 'published' })
      placeIds.push(inserted.insertId)
    }
    await db.insert(userPlaceRole).values([
      { userId: owner, placeId: placeIds[1]!, role: 'owner' },
      { userId: owner, placeId: placeIds[2]!, role: 'owner' },
      { userId: manager, placeId: placeIds[1]!, role: 'manager' },
      { userId: staff, placeId: placeIds[1]!, role: 'staff' },
      { userId: outsider, placeId: placeIds[3]!, role: 'owner' },
    ])
    const [sourceSection] = await db.insert(menuSection).values({ placeId: placeIds[0]!, name: 'نوشیدنی‌های گرم', branchScope: 'branch' })
    sectionIds.push(sourceSection.insertId)
    for (const [label, price, available, archived] of [
      ['لاته', 100000, true, false], ['آب رایگان', 0, true, false], ['چای روز', null, false, true],
    ] as const) {
      const [inserted] = await db.insert(menuItem).values({ placeId: placeIds[0]!, sectionId: sourceSection.insertId,
        publicId: `qa-portable-${suffix}-${itemIds.length}`, name: label, nameNormalized: label, price,
        priceUnknown: price === null, available, featured: label === 'لاته',
        archivedAt: archived ? new Date('2026-01-01T00:00:00Z') : null,
        priceUpdatedAt: price === null ? null : new Date('2026-01-01T00:00:00Z') })
      itemIds.push(inserted.insertId)
    }
    await db.insert(menuItemVariant).values([
      { itemId: itemIds[0]!, label: 'کوچک', price: 100000, available: true, sortOrder: 0 },
      { itemId: itemIds[0]!, label: 'بزرگ', price: 150000, available: false, sortOrder: 1 },
    ])
    const sourceData = await withDbTransaction(() => loadOwnerPlace(placeIds[0]!))
    assert.ok(sourceData)
    const exported = buildMenuExport(sourceData, new Date('2026-01-01T00:00:00Z'))
    const json = JSON.stringify(exported), csv = buildMenuCsv(exported)
    const input = { placeId: placeIds[1]!, revision: '0', text: json }
    const before = await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[1]!))
    const preview = await previewPortableImport(input, actor, secret)
    await t.test('preview only reads; authorization, file tampering and expiry fail closed', async () => {
      assert.equal(preview.newSections, 1)
      assert.equal(preview.newItems, 3)
      assert.equal(preview.newVariants, 2)
      assert.deepEqual(await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[1]!)), before)
      await assert.rejects(previewPortableImport(input, { userId: staff, label: 'staff' }, secret))
      await assert.rejects(previewPortableImport(input, { userId: outsider, label: 'other' }, secret))
      await assert.rejects(previewPortableImport(input, { userId: admin, label: 'admin', onBehalfOf: owner }, secret))
      const adminPreview = await previewPortableImport(input, { userId: admin, label: 'admin' }, secret)
      assert.equal(adminPreview.newItems, 3)
      const managerPreview = await previewPortableImport(input, { userId: manager, label: 'manager' }, secret)
      assert.equal(managerPreview.newItems, 3)
      await assert.rejects(applyPortableImport({ ...input, text: json.replace('لاته', 'موکا') }, actor, preview.token, '[0]', secret))
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0]', secret, Date.now() + 11 * 60_000))
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0,0]', secret))
      await db.update(userPlaceRole).set({ status: 'revoked' }).where(and(eq(userPlaceRole.userId, owner), eq(userPlaceRole.placeId, placeIds[1]!)))
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0]', secret))
      await db.update(userPlaceRole).set({ status: 'active' }).where(and(eq(userPlaceRole.userId, owner), eq(userPlaceRole.placeId, placeIds[1]!)))
      await db.update(appUser).set({ status: 'blocked' }).where(eq(appUser.id, owner))
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0]', secret))
      await db.update(appUser).set({ status: 'active', mustChangePassword: true }).where(eq(appUser.id, owner))
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0]', secret))
      await db.update(appUser).set({ mustChangePassword: false }).where(eq(appUser.id, owner))
    })
    await t.test('JSON import preserves menu fields, variants, archive and zero/unknown; no trusted price timestamp', async () => {
      const result = await applyPortableImport(input, actor, preview.token, '[0,1,2]', secret)
      assert.equal(result.count, 3)
      const rows = await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[1]!)).orderBy(menuItem.id)
      assert.deepEqual(rows.map(row => row.price), [100000, 0, null])
      assert.deepEqual(rows.map(row => row.available), [true, true, false])
      assert.equal(rows[0]!.featured, true)
      assert.ok(rows[2]!.archivedAt)
      assert.ok(rows.every(row => row.priceUpdatedAt === null))
      assert.ok(rows.every(row => !itemIds.includes(row.id) && !exported.sections[0]!.items.some(source => source.publicId === row.publicId)))
      const variants = await db.select().from(menuItemVariant).where(eq(menuItemVariant.itemId, rows[0]!.id)).orderBy(menuItemVariant.id)
      assert.deepEqual(variants.map(row => row.price), [100000, 150000])
      assert.deepEqual(variants.map(row => row.available), [true, false])
      assert.ok(variants.every(row => row.priceUpdatedAt === null))
      const target = await withDbTransaction(() => loadOwnerPlace(placeIds[1]!))
      assert.ok(target)
      const secondExport = buildMenuExport(target, new Date('2026-01-01T00:00:00Z'))
      assert.deepEqual(secondExport.sections[0]!.items.map(row => [row.name, row.price, row.available, row.archived, row.variants.map(v => [v.label, v.price, v.available])]),
        exported.sections[0]!.items.map(row => [row.name, row.price, row.available, row.archived, row.variants.map(v => [v.label, v.price, v.available])]))
      assert.equal((await previewPortableImport({ ...input, revision: '1' }, actor, secret)).existingItems, 3)
      await assert.rejects(applyPortableImport(input, actor, preview.token, '[0]', secret))
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[3]!))).length, 0)
    })
    await t.test('CSV import creates portable fields but never invents featured/publicId/timestamp', async () => {
      const csvInput = { placeId: placeIds[2]!, revision: '0', text: csv }
      const csvPreview = await previewPortableImport(csvInput, actor, secret)
      assert.equal(csvPreview.newItems, 3)
      await applyPortableImport(csvInput, actor, csvPreview.token, '[0,1,2]', secret)
      const rows = await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[2]!)).orderBy(menuItem.id)
      assert.deepEqual(rows.map(row => row.price), [100000, 0, null])
      assert.equal(rows[0]!.featured, false)
      assert.ok(rows.every(row => row.priceUpdatedAt === null))
      assert.equal((await previewPortableImport({ ...csvInput, revision: '1' }, actor, secret)).existingItems, 3)
    })
    await t.test('injected failure at final audit rolls back new section, item, variant and revision', async () => {
      const extra = { ...exported, sections: [{ ...exported.sections[0]!, name: 'دستهٔ تازه', items: [{ ...exported.sections[0]!.items[0]!, name: 'موکا تازه', publicId: 'external-id' }] }] }
      const failingInput = { placeId: placeIds[1]!, revision: '1', text: JSON.stringify(extra) }
      const failingPreview = await previewPortableImport(failingInput, actor, secret)
      const snapshot = await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[1]!))
      await db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_log FOR EACH ROW BEGIN IF NEW.action = 'menu.import.portable' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'QA rollback'; END IF; END`))
      try {
        await assert.rejects(applyPortableImport(failingInput, actor, failingPreview.token, '[0]', secret))
        assert.deepEqual(await db.select().from(menuItem).where(eq(menuItem.placeId, placeIds[1]!)), snapshot)
        const sections = await db.select().from(menuSection).where(and(eq(menuSection.placeId, placeIds[1]!), eq(menuSection.name, 'دستهٔ تازه')))
        assert.equal(sections.length, 0)
        assert.equal((await db.select({ revision: place.revision }).from(place).where(eq(place.id, placeIds[1]!)))[0]!.revision, 1)
      } finally { await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`)) }
    })
  } finally {
    await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${trigger}`))
    await db.delete(auditLog).where(inArray(auditLog.actorUserId, users))
    if (placeIds.length) {
      await db.delete(menuItem).where(inArray(menuItem.placeId, placeIds))
      await db.delete(menuSection).where(inArray(menuSection.placeId, placeIds))
      await db.delete(place).where(inArray(place.id, placeIds))
    }
    await db.delete(appUser).where(inArray(appUser.id, users))
    if (createdFacet) await db.delete(facet).where(eq(facet.id, 'hot_drinks'))
    await closeDb()
  }
})
