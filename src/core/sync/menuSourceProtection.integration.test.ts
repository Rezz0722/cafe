import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, menuItem, menuItemFieldOverride, menuItemVariant, menuSection, menuSectionFieldOverride, place } from '@/db/schema'
import { bulkAdjustPrices, createMenuItemVariant, setMenuItemArchived, updateMenuItem, updateMenuItemVariant, updateMenuSection } from '@/core/places/manage'
import { applyPricePlan, makePricePlan } from '@/core/places/menuPrices'

test('real disposable MariaDB: owner edits survive two TopMenu preview/apply cycles', { skip: process.env.KUCAFE_SOURCE_PROTECTION_DB_TEST !== '1' }, async () => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(url.hostname, '127.0.0.1')
  assert.ok((url.pathname === '/kucafe_p1_qa' && url.port === '3307') || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe'), 'Disposable database required; Production forbidden')
  const db = getDb(), id = randomUUID(), fixture = Math.floor(Math.random() * 100000)
  const cafeSourceId = 900000000 + fixture, itemSourceId = 901000000 + fixture
  const temp = await mkdtemp(join(tmpdir(), 'kucafe-p1-qa-'))
  const actor = { userId: id, label: 'QA owner' }
  let placeId = 0, otherPlaceId = 0, liparPlaceId = 0, sectionId = 0, itemId = 0
  const run = (mode: 'scrape' | 'apply', runId: string, sourceFile: string) => {
    try {
      execFileSync(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', mode, runId], {
        cwd: process.cwd(), timeout: 90_000,
        env: { ...process.env, TOPMENU_SYNC_ROOT: temp, TOPMENU_SYNC_SOURCE_FILE: sourceFile, TOPMENU_SYNC_BACKUP_DIR: join(temp, 'backups'), TOPMENU_SYNC_SMOKE_TEST: '1' },
        stdio: 'pipe',
      })
    } catch (error) {
      let detail = 'No state error recorded'
      try { detail = JSON.parse(readFileSync(join(temp, 'state.json'), 'utf8')).error || detail } catch { /* original command error below */ }
      if (mode === 'apply' && detail.includes('backup.log')) {
        try { detail += ` / ${readFileSync(join(temp, 'runs', runId, 'backup.log'), 'utf8').slice(-1000)}` } catch { /* no backup log */ }
      }
      throw new Error(`TopMenu ${mode} failed: ${detail}`, { cause: error })
    }
  }
  const source = (description: string, price: number, category: string) => [{
    'شناسه': cafeSourceId, 'نام مجموعه': 'QA Cafe', 'یوزرنیم': `qa-${fixture}`,
    'منو': [{ 'دسته‌بندی': category, 'آیتم‌ها': [
      { 'شناسه': itemSourceId, 'نام': 'QA لاته منبع', 'توضیحات': description, 'قیمت (تومان)': price, 'موجود است': true },
      { 'شناسه': itemSourceId + 1, 'نام': 'QA قیمت نامعلوم', 'توضیحات': 'قیمت روز', 'قیمت (تومان)': null, 'موجود است': true },
    ] }],
  }]
  const snapshot = async () => (await db.select().from(menuItem).where(eq(menuItem.id, itemId)))[0]!
  try {
    await db.insert(appUser).values({ id, name: 'QA owner', role: 'owner' })
    const [p] = await db.insert(place).values({ slug: `qa-p1-${fixture}`, name: 'QA Cafe', nameNormalized: 'qa cafe', sourceId: cafeSourceId, status: 'published', priceUnitFixed: true })
    const [other] = await db.insert(place).values({ slug: `qa-p1-other-${fixture}`, name: 'Other QA Cafe', nameNormalized: 'other qa cafe', status: 'published' })
    placeId = p.insertId; otherPlaceId = other.insertId
    const legacySyncTime = new Date('2026-09-01T12:00:00Z')
    await db.update(place).set({ source: 'import', lastVerifiedAt: legacySyncTime }).where(eq(place.id, placeId))
    execFileSync(process.execPath, ['scripts/run-sql.mjs', 'drizzle/0016_menu_source_sync_time.sql'], { cwd: process.cwd(), env: process.env, stdio: 'pipe' })
    const legacyPlace = (await db.select().from(place).where(eq(place.id, placeId)))[0]!
    assert.equal(legacyPlace.lastSourceSyncAt?.getTime(), legacySyncTime.getTime(), 'legacy import sync gets a separate date')
    assert.equal(legacyPlace.lastVerifiedAt?.getTime(), legacySyncTime.getTime(), 'migration does not erase uncertain historical data')
    const [s] = await db.insert(menuSection).values({ placeId, name: 'QA قهوه', sourceName: 'QA قهوه' })
    sectionId = s.insertId
    const [i] = await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa_p1_${fixture}`, sourceId: itemSourceId, name: 'QA لاته منبع', nameNormalized: 'qa لاته منبع', price: 100000, available: true })
    itemId = i.insertId
    const [manual] = await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa_p1_manual_${fixture}`, name: 'آیتم دستی', nameNormalized: 'آیتم دستی', price: 70000 })
    const manualId = manual.insertId
    const [otherSection] = await db.insert(menuSection).values({ placeId: otherPlaceId, name: 'QA قهوه' })
    assert.equal((await updateMenuItem(itemId, { name: 'لاته مالک', price: 135000, available: false }, actor)).ok, true)
    const ownerPriceUpdatedAt = (await snapshot()).priceUpdatedAt
    assert.equal((await updateMenuItem(itemId, { price: 135000 }, actor)).ok, true)
    assert.equal((await snapshot()).priceUpdatedAt?.getTime(), ownerPriceUpdatedAt?.getTime(), 'saving an unchanged price cannot refresh its date')
    assert.equal((await createMenuItemVariant(manualId, { label: 'کوچک', price: 1000 }, actor)).ok, true)
    assert.equal((await createMenuItemVariant(manualId, { label: 'بزرگ', price: 80000 }, actor)).ok, true)
    const baseBeforeVariantEdit = (await db.select().from(menuItem).where(eq(menuItem.id, manualId)))[0]!.priceUpdatedAt
    const [largeVariant] = await db.select().from(menuItemVariant).where(eq(menuItemVariant.itemId, manualId))
      .then(rows => rows.filter(row => row.label === 'بزرگ'))
    assert.ok(largeVariant)
    assert.equal((await updateMenuItemVariant(largeVariant.id, { label: 'بزرگ جدید', price: 80000, available: true }, actor)).ok, true)
    const renamedVariant = (await db.select().from(menuItemVariant).where(eq(menuItemVariant.id, largeVariant.id)))[0]!
    assert.equal(renamedVariant.priceUpdatedAt?.getTime(), largeVariant.priceUpdatedAt?.getTime(), 'label-only edit keeps variant price date')
    assert.equal((await db.select().from(menuItem).where(eq(menuItem.id, manualId)))[0]!.priceUpdatedAt?.getTime(), baseBeforeVariantEdit?.getTime(), 'non-price variant edit keeps base price date')
    const pricePlan = await makePricePlan(placeId, 1, { scope: 'items', itemIds: [manualId] })
    assert.deepEqual(pricePlan.changes.map(change => change.id), [largeVariant.id], 'rounded minimum price is unchanged')
    await applyPricePlan(placeId, pricePlan, pricePlan.fingerprint, actor)
    assert.equal((await db.select().from(menuItem).where(eq(menuItem.id, manualId)))[0]!.priceUpdatedAt?.getTime(), baseBeforeVariantEdit?.getTime(), 'non-minimum bulk change keeps base price date')
    assert.equal((await updateMenuSection(placeId, sectionId, 'دسته مالک', actor)).ok, true)
    const overrides = await db.select().from(menuItemFieldOverride).where(eq(menuItemFieldOverride.itemId, itemId))
    assert.deepEqual(overrides.map(row => row.fieldName).sort(), ['available', 'name', 'price'])
    assert.equal((await db.select().from(menuSectionFieldOverride).where(eq(menuSectionFieldOverride.sectionId, sectionId))).length, 1)

    for (const [index, [description, price, category]] of ([['منبع یک', 110, 'QA قهوه'], ['منبع دو', 120, 'QA قهوه تازه'], ['منبع دو', 120, 'QA قهوه تازه']] as const).entries()) {
      const runId = `qa_p1_${fixture}_${index}`, sourceFile = join(temp, `source-${index}.json`)
      await writeFile(sourceFile, JSON.stringify(source(description, price, category)))
      await mkdir(join(temp, 'runs', runId), { recursive: true })
      await writeFile(join(temp, 'runs', runId, 'scrape-selection.json'), JSON.stringify({ scope: 'selected', sourceIds: [cafeSourceId] }))
      await writeFile(join(temp, 'runs', runId, 'apply-selection.json'), JSON.stringify({ scope: 'selected', sourceIds: [cafeSourceId] }))
      run('scrape', runId, sourceFile)
      const preview = JSON.parse(await readFile(join(temp, 'state.json'), 'utf8'))
      assert.ok(preview.report.protectedCount >= 3)
      assert.equal(preview.report.priceChanges, 0)
      assert.equal(preview.report.protectedChanges.find((change: {field: string}) => change.field === 'price')?.source, price * 1000)
      if (index === 2) assert.equal(preview.report.totalChanges, 0, 'identical snapshot is idempotent')
      run('apply', runId, sourceFile)
      const syncedPlace = (await db.select().from(place).where(eq(place.id, placeId)))[0]!
      assert.ok(syncedPlace.lastSourceSyncAt && syncedPlace.lastSourceSyncAt > legacySyncTime, 'source sync has its own timestamp')
      assert.equal(syncedPlace.lastVerifiedAt?.getTime(), legacySyncTime.getTime(), 'source sync never claims human verification')
      const [syncAudit] = await db.select().from(auditLog).where(eq(auditLog.entityId, runId)).limit(1)
      assert.equal(syncAudit?.action, 'topmenu.full_sync', 'each committed snapshot has a durable audit record')
      const item = await snapshot()
      assert.equal(item.name, 'لاته مالک')
      assert.equal(item.price, 135000)
      assert.equal(item.priceUpdatedAt?.getTime(), ownerPriceUpdatedAt?.getTime(), 'unchanged owner price keeps its actual edit timestamp')
      assert.equal(item.available, false)
      assert.equal(item.description, description)
      assert.equal(item.sectionId, sectionId)
      const [unknownPriceItem] = await db.select().from(menuItem).where(eq(menuItem.sourceId, itemSourceId + 1)).limit(1)
      assert.equal(unknownPriceItem?.price, null)
      assert.equal(unknownPriceItem?.priceUpdatedAt, null, 'an unknown source price must not acquire a misleading date')
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.id, sectionId)))[0]!.name, 'دسته مالک')
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.id, sectionId)))[0]!.sourceName, category)
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.placeId, placeId))).length, 1)
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, placeId))).length, 3)
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, otherPlaceId))).length, 0)
    }
    const oldBulkDate = new Date('2026-09-01T12:00:00Z')
    const [bulkItem] = await db.insert(menuItem).values({ placeId: otherPlaceId, sectionId: otherSection.insertId, publicId: `qa_p1_bulk_${fixture}`, name: 'قیمت گروهی', nameNormalized: 'قیمت گروهی', price: 100000, priceUpdatedAt: oldBulkDate })
    assert.deepEqual(await bulkAdjustPrices(otherPlaceId, 0.1, actor), { ok: true, changed: 0 })
    assert.equal((await db.select().from(menuItem).where(eq(menuItem.id, bulkItem.insertId)))[0]!.priceUpdatedAt?.getTime(), oldBulkDate.getTime(), 'rounded no-op bulk edit preserves price date')
    assert.equal((await db.select().from(menuItemFieldOverride).where(eq(menuItemFieldOverride.itemId, bulkItem.insertId))).length, 0, 'rounded no-op bulk edit does not claim an owner override')
    const bulkResult = await bulkAdjustPrices(otherPlaceId, 10, actor)
    assert.equal(bulkResult.ok, true)
    assert.ok((bulkResult.changed ?? 0) > 0)
    const [changedBulkItem] = await db.select().from(menuItem).where(eq(menuItem.id, bulkItem.insertId))
    assert.equal(changedBulkItem?.price, 110000)
    assert.ok(changedBulkItem?.priceUpdatedAt && changedBulkItem.priceUpdatedAt > oldBulkDate, 'a real bulk price change advances its date')
    assert.equal((await setMenuItemArchived(itemId, true, actor)).ok, true)
    const archiveRun = `qa_p1_${fixture}_archive`, archiveSource = join(temp, 'source-archive.json')
    await writeFile(archiveSource, JSON.stringify(source('منبع دو', 120, 'QA قهوه تازه')))
    await mkdir(join(temp, 'runs', archiveRun), { recursive: true })
    for (const mode of ['scrape', 'apply'] as const) await writeFile(join(temp, 'runs', archiveRun, `${mode}-selection.json`), JSON.stringify({ scope: 'selected', sourceIds: [cafeSourceId] }))
    run('scrape', archiveRun, archiveSource)
    const archivePreview = JSON.parse(await readFile(join(temp, 'state.json'), 'utf8'))
    assert.ok(archivePreview.report.protectedChanges.some((change: { field: string }) => change.field === 'archivedAt'))
    run('apply', archiveRun, archiveSource)
    assert.ok((await snapshot()).archivedAt, 'source did not reactivate owner-archived item')
    const [lipar] = await db.insert(place).values({ slug: 'lipar-cafe-branch-1', name: 'لیپار آزمایشی', nameNormalized: 'لیپار آزمایشی', status: 'draft' })
    liparPlaceId = lipar.insertId
    const [liparSection] = await db.insert(menuSection).values({ placeId: liparPlaceId, name: 'دسته آزمایشی' })
    const [liparItem] = await db.insert(menuItem).values({ placeId: liparPlaceId, sectionId: liparSection.insertId, publicId: `qa_lipar_${fixture}`, name: 'آیتم مالک', nameNormalized: 'آیتم مالک', price: 90000 })
    await db.insert(menuItemFieldOverride).values({ itemId: liparItem.insertId, fieldName: 'price', actorUserId: id })
    assert.throws(() => execFileSync(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/import-lipar.ts', '--apply'], { cwd: process.cwd(), timeout: 30_000, env: process.env, stdio: 'pipe' }), (error: unknown) => String((error as { stderr?: Buffer }).stderr).includes('ویرایش انسانی'), 'manual import must fail closed because of a protected edit')
    assert.equal((await db.select().from(place).where(eq(place.id, liparPlaceId)))[0]!.name, 'لیپار آزمایشی')
    assert.ok((await db.select().from(auditLog).where(eq(auditLog.actorUserId, id))).some(row => row.action === 'menu_item.update'))
  } finally {
    if (placeId || otherPlaceId || liparPlaceId) await db.delete(place).where(inArray(place.id, [placeId, otherPlaceId, liparPlaceId].filter(Boolean)))
    await db.delete(auditLog).where(eq(auditLog.actorUserId, id))
    await db.delete(appUser).where(eq(appUser.id, id))
    await closeDb()
    await rm(temp, { recursive: true, force: true })
  }
})
