import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb } from '@/db/client'
import { appUser, auditLog, menuItem, menuItemFieldOverride, menuSection, menuSectionFieldOverride, place } from '@/db/schema'
import { setMenuItemArchived, updateMenuItem, updateMenuSection } from '@/core/places/manage'

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
    execFileSync(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', mode, runId], {
      cwd: process.cwd(), timeout: 90_000,
      env: { ...process.env, TOPMENU_SYNC_ROOT: temp, TOPMENU_SYNC_SOURCE_FILE: sourceFile, TOPMENU_SYNC_BACKUP_DIR: join(temp, 'backups'), TOPMENU_SYNC_SMOKE_TEST: '1' },
      stdio: 'pipe',
    })
  }
  const source = (description: string, price: number, category: string) => [{
    'شناسه': cafeSourceId, 'نام مجموعه': 'QA Cafe', 'یوزرنیم': `qa-${fixture}`,
    'منو': [{ 'دسته‌بندی': category, 'آیتم‌ها': [{ 'شناسه': itemSourceId, 'نام': 'QA لاته منبع', 'توضیحات': description, 'قیمت (تومان)': price, 'موجود است': true }] }],
  }]
  const snapshot = async () => (await db.select().from(menuItem).where(eq(menuItem.id, itemId)))[0]!
  try {
    await db.insert(appUser).values({ id, name: 'QA owner', role: 'owner' })
    const [p] = await db.insert(place).values({ slug: `qa-p1-${fixture}`, name: 'QA Cafe', nameNormalized: 'qa cafe', sourceId: cafeSourceId, status: 'published', priceUnitFixed: true })
    const [other] = await db.insert(place).values({ slug: `qa-p1-other-${fixture}`, name: 'Other QA Cafe', nameNormalized: 'other qa cafe', status: 'published' })
    placeId = p.insertId; otherPlaceId = other.insertId
    const [s] = await db.insert(menuSection).values({ placeId, name: 'QA قهوه', sourceName: 'QA قهوه' })
    sectionId = s.insertId
    const [i] = await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa_p1_${fixture}`, sourceId: itemSourceId, name: 'QA لاته منبع', nameNormalized: 'qa لاته منبع', price: 100000, available: true })
    itemId = i.insertId
    await db.insert(menuItem).values({ placeId, sectionId, publicId: `qa_p1_manual_${fixture}`, name: 'آیتم دستی', nameNormalized: 'آیتم دستی', price: 70000 })
    await db.insert(menuSection).values({ placeId: otherPlaceId, name: 'QA قهوه' })
    assert.equal((await updateMenuItem(itemId, { name: 'لاته مالک', price: 135000, available: false }, actor)).ok, true)
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
      const item = await snapshot()
      assert.equal(item.name, 'لاته مالک')
      assert.equal(item.price, 135000)
      assert.equal(item.available, false)
      assert.equal(item.description, description)
      assert.equal(item.sectionId, sectionId)
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.id, sectionId)))[0]!.name, 'دسته مالک')
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.id, sectionId)))[0]!.sourceName, category)
      assert.equal((await db.select().from(menuSection).where(eq(menuSection.placeId, placeId))).length, 1)
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, placeId))).length, 2)
      assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, otherPlaceId))).length, 0)
    }
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
