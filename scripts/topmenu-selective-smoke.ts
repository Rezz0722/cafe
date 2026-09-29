/** Run the REAL scrape/report/apply pipeline on a structure-only disposable DB.
 * Never import production data or apply the worker against production.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import mysql from 'mysql2/promise'
import type { RawCafe } from '../src/core/import/source'
const execute = promisify(execFile)
process.loadEnvFile('.env.local')
const original = new URL(process.env.DATABASE_URL!)
const credentials = Object.fromEntries((await readFile('/usr/local/directadmin/conf/mysql.conf', 'utf8')).trim().split('\n').map(line => { const split = line.indexOf('='); return [line.slice(0, split).trim(), line.slice(split + 1).trim()] }))
if (!credentials.user || !credentials.passwd) throw new Error('Local database administration config is unavailable')
const administrator = await mysql.createConnection({ host: '127.0.0.1', user: credentials.user, password: credentials.passwd, multipleStatements: true })
const database = `kucafe_sync_qa_${randomUUID().replaceAll('-', '').slice(0, 10)}`
assert.match(database, /^kucafe_sync_qa_[a-f0-9]{10}$/)
const root = await mkdtemp('/tmp/kucafe-selective-')
const runs: string[] = []
let created = false
try {
  const ddl = (await execute('mysqldump', ['--no-data', '--no-tablespaces', '--skip-lock-tables', '--host', original.hostname,
    '--port', original.port || '3306', '--user', decodeURIComponent(original.username), original.pathname.slice(1)],
    { env: { ...process.env, MYSQL_PWD: decodeURIComponent(original.password) }, maxBuffer: 20000000 })).stdout
  // Refuse DDL that could switch away from or qualify another database.
  assert.ok(!/^\s*(USE|CREATE DATABASE)\b/im.test(ddl))
  assert.ok(!ddl.includes(`\`${original.pathname.slice(1)}\`.`))
  await administrator.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true
  await administrator.changeUser({ database })
  await administrator.query(ddl)
  const isolated = new URL('mysql://127.0.0.1:3306')
  isolated.username = credentials.user; isolated.password = credentials.passwd; isolated.pathname = database
  process.env.DATABASE_URL = isolated.toString()
  process.env.TOPMENU_SYNC_ROOT = root
  process.env.TOPMENU_SYNC_SMOKE_TEST = '1'
  const { getDb, closeDb } = await import('../src/db/connection')
  const { place, menuSection, menuItem, facet } = await import('../src/db/schema')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  try {
    await db.insert(facet).values({ id: 'main_dish', slug: 'food', labelFa: 'غذا', kind: 'menu' })
    const [first] = await db.insert(place).values({ slug: 'sync-first', name: 'اول', nameNormalized: 'اول', sourceId: 101, status: 'draft', priceUnitFixed: false }).$returningId()
    const [other] = await db.insert(place).values({ slug: 'sync-other', name: 'دوم', nameNormalized: 'دوم', sourceId: 102, status: 'draft', priceUnitFixed: false }).$returningId()
    const [a] = await db.insert(menuSection).values({ placeId: first.id, name: 'غذا' }).$returningId()
    const [b] = await db.insert(menuSection).values({ placeId: other.id, name: 'غذا' }).$returningId()
    await db.insert(menuItem).values([
      { publicId: 'qa-1001', placeId: first.id, sectionId: a.id, sourceId: 1001, name: 'پاستا', nameNormalized: 'پاستا', price: 120000 },
      { publicId: 'qa-1100', placeId: first.id, sectionId: a.id, sourceId: 1100, name: 'قدیمی', nameNormalized: 'قدیمی', price: 160000 },
      { publicId: 'qa-manual', placeId: first.id, sectionId: a.id, name: 'دستی', nameNormalized: 'دستی', price: 180000 },
      { publicId: 'qa-1002', placeId: other.id, sectionId: b.id, sourceId: 1002, name: 'پاستا', nameNormalized: 'پاستا', price: 150000 },
    ])
    const beforePlace = (await db.select().from(place).where(eq(place.id, other.id)))[0]
    const beforeMenu = await db.select().from(menuItem).where(eq(menuItem.placeId, other.id))
    const cafes: RawCafe[] = [
      { 'شناسه': 101, 'نام مجموعه': 'اول', 'یوزرنیم': 'sync.first', 'منو': [{ 'دسته‌بندی': 'غذا', 'آیتم‌ها': [{ 'شناسه': 1001, 'نام': 'پاستا', 'قیمت (تومان)': 200000 }] }] },
      { 'شناسه': 102, 'نام مجموعه': 'دوم', 'یوزرنیم': 'sync.other', 'منو': [{ 'دسته‌بندی': 'غذا', 'آیتم‌ها': [{ 'شناسه': 1002, 'نام': 'پاستا', 'قیمت (تومان)': 400000 }] }] },
      { 'شناسه': 103, 'نام مجموعه': 'کافه تست جدید', 'یوزرنیم': 'sync.new', 'منو': [{ 'دسته‌بندی': 'غذا', 'آیتم‌ها': [{ 'شناسه': 1003, 'نام': 'پاستا', 'قیمت (تومان)': 250000 }], 'زیردسته‌ها': [{ 'دسته‌بندی': 'پیتزا', 'آیتم‌ها': [{ 'شناسه': 1004, 'نام': 'پیتزا', 'قیمت (تومان)': 300000 }] }] }] },
    ]
    const fixture = join(root, 'source.json'); await writeFile(fixture, JSON.stringify(cafes))
    let runId = `qa-selected-${randomUUID().slice(0, 8)}`; runs.push(runId)
    let directory = join(root, 'runs', runId); await mkdir(directory, { recursive: true })
    await writeFile(join(root, 'state.json'), JSON.stringify({ runId, status: 'scraping', actorLabel: 'isolated QA' }))
    await writeFile(join(directory, 'scrape-selection.json'), JSON.stringify({ scope: 'selected', sourceIds: [101, 103] }))
    await execute(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', 'scrape', runId], { env: { ...process.env, TOPMENU_SYNC_SOURCE_FILE: fixture }, timeout: 60000 })
    const snapshot = JSON.parse(await readFile(join(directory, 'cafes_full_latest.json'), 'utf8')) as RawCafe[]
    assert.deepEqual(snapshot.map(cafe => cafe['شناسه']), [101, 103])
    const report = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
    assert.equal(report.status, 'ready'); assert.equal(report.report.sourceCafes, 2)
    console.log('✓ Selective scrape produces only selected cafes and a scoped report')
    runId = `qa-full-${randomUUID().slice(0, 8)}`; runs.push(runId)
    directory = join(root, 'runs', runId); await mkdir(directory, { recursive: true })
    await writeFile(join(root, 'state.json'), JSON.stringify({ runId, status: 'scraping', actorLabel: 'isolated QA' }))
    await writeFile(join(directory, 'scrape-selection.json'), JSON.stringify({ scope: 'all', sourceIds: [] }))
    await execute(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', 'scrape', runId], { env: { ...process.env, TOPMENU_SYNC_SOURCE_FILE: fixture }, timeout: 60000 })
    assert.equal(JSON.parse(await readFile(join(root, 'state.json'), 'utf8')).report.sourceCafes, 3)
    console.log('✓ Explicit full scrape still works; apply will select only a subset of its report')
    await writeFile(join(directory, 'apply-selection.json'), JSON.stringify({ scope: 'selected', sourceIds: [101, 103] }))
    try { await execute(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', 'apply', runId], { env: process.env, timeout: 60000 }) }
    catch { const failure = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')); throw new Error(`Isolated apply: ${failure.error ?? 'worker failed'}`) }
    const applied = JSON.parse(await readFile(join(root, 'state.json'), 'utf8'))
    assert.equal(applied.status, 'completed'); assert.equal(applied.applied.affectedCafes, 2)
    assert.deepEqual((await db.select().from(place).where(eq(place.id, other.id)))[0], beforePlace)
    assert.deepEqual(await db.select().from(menuItem).where(eq(menuItem.placeId, other.id)), beforeMenu)
    const selectedMenu = await db.select().from(menuItem).where(eq(menuItem.placeId, first.id))
    assert.equal(selectedMenu.find(item => item.sourceId === 1001)?.price, 200000)
    assert.ok(selectedMenu.find(item => item.sourceId === 1100)?.archivedAt)
    assert.equal(selectedMenu.find(item => item.sourceId === null)?.archivedAt, null)
    const newlyAdded = (await db.select().from(place).where(eq(place.sourceId, 103)))[0]
    assert.ok(newlyAdded); assert.equal((await db.select().from(menuItem).where(eq(menuItem.placeId, newlyAdded.id))).length, 2)
    console.log('✓ Selected prices/menu/new cafe synced; unselected cafe and menu byte-for-byte unchanged; manual item preserved')
    const beforeReject = await db.select().from(menuItem)
    for (const sourceIds of [[], [999]]) {
      await writeFile(join(directory, 'apply-selection.json'), JSON.stringify({ scope: 'selected', sourceIds }))
      await assert.rejects(execute(process.execPath, ['--import', 'tsx', '--conditions=react-server', 'scripts/topmenu-sync.ts', 'apply', runId], { env: process.env, timeout: 60000 }))
      assert.deepEqual(await db.select().from(menuItem), beforeReject)
    }
    console.log('✓ Empty/unknown selection rejected without applying data')
    process.env.TOPMENU_SYNC_SOURCE_FILE = fixture
    const { startTopMenuSync, readTopMenuSyncState } = await import('../src/core/sync/topMenuSync')
    const actor = { userId: '', label: 'isolated QA' }
    const options = { selection: { scope: 'selected' as const, sourceIds: [101] } }
    const concurrent = await Promise.all([startTopMenuSync('scrape', actor, options), startTopMenuSync('scrape', actor, options)])
    assert.equal(concurrent.filter(result => result.ok).length, 1)
    let latest = await readTopMenuSyncState()
    for (let tries = 0; latest.status === 'scraping' && tries < 200; tries++) {
      await new Promise(resolve => setTimeout(resolve, 200)); latest = await readTopMenuSyncState()
    }
    assert.equal(latest.status, 'ready', latest.error)
    assert.equal(latest.report?.sourceCafes, 1)
    assert.equal((await startTopMenuSync('apply', actor, { ...options, expectedRunId: 'old-report' })).ok, false)
    assert.equal((await readTopMenuSyncState()).status, 'ready')
    console.log('✓ Job start: one of two concurrent requests starts; selected manifest respected; stale report rejected')
  } finally { await closeDb() }
} finally {
  if (created) await administrator.query(`DROP DATABASE \`${database}\``)
  await administrator.end()
  for (const runId of runs) await unlink(join('backups', `kucafe-before-topmenu-${runId}.sql.gz`)).catch(() => {})
  assert.ok(root.startsWith('/tmp/kucafe-selective-')); await rm(root, { recursive: true, force: true })
}
