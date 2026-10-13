/** Destructive only on the explicitly disposable CI/QA database. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import mysql from 'mysql2/promise'

const url = new URL(process.env.DATABASE_URL ?? '')
const ci = process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe' &&
  (url.port || '3306') === '3306' && url.username === 'kucafe' && url.password === 'ci-only-password'
const qa = url.pathname === '/kucafe_p1_qa' && url.port === '3307' &&
  url.username === 'kucafe_qa' && url.password === 'qa-only-password'
assert.equal(process.env.KUCAFE_TIMESTAMP_DB_TEST, '1', 'Explicit disposable-DB opt-in required')
assert.equal(url.hostname, '127.0.0.1', 'Only loopback MariaDB is allowed')
assert.ok(ci || qa, 'Production database is forbidden')

const db = await mysql.createConnection(process.env.DATABASE_URL)
const runSql = file => execFileSync(process.execPath, ['scripts/run-sql.mjs', file], {
  cwd: process.cwd(), env: process.env, stdio: 'pipe', timeout: 120_000,
})
const fingerprint = () => execFileSync(process.execPath, ['scripts/place-timestamp-fingerprint.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 30_000,
}).trim()
const timestamps = async ids => {
  const [rows] = await db.query(`SELECT id, UNIX_TIMESTAMP(last_verified_at) AS verified,
    UNIX_TIMESTAMP(updated_at) AS updated, UNIX_TIMESTAMP(last_source_sync_at) AS synced
    FROM place WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids)
  return rows
}

try {
  await db.query("SET time_zone = '+00:00'")
  const [[count]] = await db.query('SELECT COUNT(*) AS n FROM place')
  assert.equal(count.n, 0, 'This test may only alter an empty disposable place table')
  const [[itemCount]] = await db.query('SELECT COUNT(*) AS n FROM menu_item')
  assert.equal(itemCount.n, 0, 'This test may only alter an empty disposable menu table')

  // MariaDB 10.6's real production DDL, not the safer schema CI normally creates.
  await db.query('ALTER TABLE place DROP COLUMN last_source_sync_at')
  await db.query('ALTER TABLE place MODIFY COLUMN last_verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
  await db.query('ALTER TABLE place ADD COLUMN last_source_sync_at TIMESTAMP NULL DEFAULT NULL AFTER last_verified_at')
  const [[legacy]] = await db.query(`SELECT IS_NULLABLE, EXTRA FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'place' AND COLUMN_NAME = 'last_verified_at'`)
  assert.equal(legacy.IS_NULLABLE, 'NO')
  assert.match(legacy.EXTRA.toLowerCase(), /on update/)

  const [a] = await db.query(`INSERT INTO place
    (slug, name, name_normalized, source, source_id, last_verified_at, updated_at)
    VALUES ('qa-verified-timestamp-a', 'QA A', 'qa a', 'import', 990001,
      '2026-01-02 03:04:05', '2026-02-03 04:05:06')`)
  const [b] = await db.query(`INSERT INTO place
    (slug, name, name_normalized, source, source_id, last_verified_at, updated_at)
    VALUES ('qa-verified-timestamp-b', 'QA B', 'qa b', 'import', 990002,
      '2026-03-04 05:06:07', '2026-04-05 06:07:08')`)
  const ids = [a.insertId, b.insertId]
  await db.query('ALTER TABLE menu_item MODIFY COLUMN price_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
  const [section] = await db.query("INSERT INTO menu_section (place_id, name) VALUES (?, 'QA menu')", [ids[0]])
  const [priced] = await db.query(`INSERT INTO menu_item
    (public_id, place_id, section_id, name, name_normalized, price, price_updated_at)
    VALUES ('qa_timestamp_priced', ?, ?, 'QA priced', 'qa priced', 100000, '2026-05-06 07:08:09')`,
  [ids[0], section.insertId])
  const [unknown] = await db.query(`INSERT INTO menu_item
    (public_id, place_id, section_id, name, name_normalized, price, price_unknown)
    VALUES ('qa_timestamp_unknown', ?, ?, 'QA unknown', 'qa unknown', NULL, 1)`,
  [ids[0], section.insertId])
  const itemDates = async () => {
    const [rows] = await db.query(`SELECT id, UNIX_TIMESTAMP(price_updated_at) AS priceUpdated
      FROM menu_item WHERE id IN (?, ?) ORDER BY id`, [priced.insertId, unknown.insertId])
    return rows
  }
  const initialPriceDates = await itemDates()
  const beforeBrokenPriceHash = fingerprint()
  await db.query("UPDATE menu_item SET description = 'not a price edit' WHERE id = ?", [priced.insertId])
  const brokenPriceDates = await itemDates()
  assert.notEqual(brokenPriceDates[0].priceUpdated, initialPriceDates[0].priceUpdated,
    'legacy ON UPDATE falsely dates a non-price edit')
  assert.notEqual(brokenPriceDates[1].priceUpdated, null,
    'legacy default falsely dates an unknown price')
  assert.notEqual(fingerprint(), beforeBrokenPriceHash,
    'release fingerprint detects a false priced-item timestamp change')
  const [original] = await timestamps([ids[0]])

  // Reproduce the exact production failure on this legacy table.
  const beforeBrokenPlaceHash = fingerprint()
  await db.query('UPDATE place SET last_source_sync_at = last_verified_at WHERE id = ?', [ids[0]])
  const [broken] = await timestamps([ids[0]])
  assert.notEqual(broken.verified, original.verified, 'old 0016 must reproduce false verification')
  assert.notEqual(broken.updated, original.updated, 'old 0016 must reproduce false edit time')
  assert.notEqual(fingerprint(), beforeBrokenPlaceHash,
    'release fingerprint detects the original 0016 failure')
  await db.query(`UPDATE place SET last_source_sync_at = NULL,
    last_verified_at = FROM_UNIXTIME(?), updated_at = FROM_UNIXTIME(?) WHERE id = ?`,
  [original.verified, original.updated, ids[0]])

  // A real edit between a snapshot and the migration must be retained.
  const [, originalSecond] = await timestamps(ids)
  await db.query("UPDATE place SET about = 'real concurrent edit' WHERE id = ?", [ids[1]])
  const before = await timestamps(ids)
  assert.notEqual(before[1].verified, originalSecond.verified, 'real edit advanced the legacy automatic timestamp')
  const beforePriceDates = await itemDates()
  const beforeHash = fingerprint()
  runSql('drizzle/0016_menu_source_sync_time.sql')
  runSql('drizzle/0017_provenance_timestamp_integrity.sql')
  const after = await timestamps(ids)
  assert.deepEqual(after.map(({ id, verified, updated }) => ({ id, verified, updated })),
    before.map(({ id, verified, updated }) => ({ id, verified, updated })),
    'zero unintended verification/edit timestamp changes, row by row')
  assert.deepEqual(after.map(row => row.synced), before.map(row => row.verified))
  assert.equal(fingerprint(), beforeHash, 'deployment fingerprint is unchanged')
  const afterPriceDates = await itemDates()
  assert.equal(afterPriceDates[0].priceUpdated, beforePriceDates[0].priceUpdated,
    'existing priced item keeps its timestamp')
  assert.equal(afterPriceDates[1].priceUpdated, null,
    'unknown price loses its synthetic timestamp')

  // Already-applied 0016: keep existing sync values and repair drifted DDL.
  await db.query('DELETE FROM menu_item WHERE id = ?', [unknown.insertId])
  await db.query('ALTER TABLE place MODIFY COLUMN last_verified_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
  await db.query('ALTER TABLE menu_item MODIFY COLUMN price_updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
  const existingBefore = await timestamps(ids)
  const [existingPrice] = await itemDates()
  const existingHash = fingerprint()
  runSql('drizzle/0016_menu_source_sync_time.sql')
  runSql('drizzle/0017_provenance_timestamp_integrity.sql')
  assert.deepEqual(await timestamps(ids), existingBefore)
  const [repairedPrice] = await itemDates()
  assert.equal(repairedPrice.priceUpdated, existingPrice.priceUpdated)
  assert.equal(fingerprint(), existingHash)
  runSql('drizzle/0016_menu_source_sync_time.sql')
  runSql('drizzle/0017_provenance_timestamp_integrity.sql')
  assert.deepEqual(await timestamps(ids), existingBefore, 'repeat migrations are idempotent')

  const [[fixed]] = await db.query(`SELECT IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'place' AND COLUMN_NAME = 'last_verified_at'`)
  assert.equal(fixed.IS_NULLABLE, 'YES')
  assert.ok(fixed.COLUMN_DEFAULT === null || String(fixed.COLUMN_DEFAULT).toUpperCase() === 'NULL')
  assert.doesNotMatch(fixed.EXTRA.toLowerCase(), /on update/)
  const [[fixedPrice]] = await db.query(`SELECT IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'menu_item' AND COLUMN_NAME = 'price_updated_at'`)
  assert.equal(fixedPrice.IS_NULLABLE, 'YES')
  assert.ok(fixedPrice.COLUMN_DEFAULT === null || String(fixedPrice.COLUMN_DEFAULT).toUpperCase() === 'NULL')
  assert.doesNotMatch(fixedPrice.EXTRA.toLowerCase(), /on update/)
  await db.query("UPDATE menu_item SET description = 'later non-price edit' WHERE id = ?", [priced.insertId])
  const [unmodifiedPrice] = await itemDates()
  assert.equal(unmodifiedPrice.priceUpdated, existingPrice.priceUpdated)
  const [freshUnknown] = await db.query(`INSERT INTO menu_item
    (public_id, place_id, section_id, name, name_normalized, price, price_unknown)
    VALUES ('qa_timestamp_unknown_new', ?, ?, 'QA unknown new', 'qa unknown new', NULL, 1)`,
  [ids[0], section.insertId])
  const [[unknownFreshDate]] = await db.query('SELECT price_updated_at AS priceUpdated FROM menu_item WHERE id = ?', [freshUnknown.insertId])
  assert.equal(unknownFreshDate.priceUpdated, null)

  // Future source Apply must update sync time, never human verification.
  await db.query('UPDATE place SET last_source_sync_at = CURRENT_TIMESTAMP WHERE id = ?', [ids[0]])
  const [syncOnly] = await timestamps([ids[0]])
  assert.equal(syncOnly.verified, before[0].verified)
  assert.ok(syncOnly.synced > before[0].verified)
  await db.query("UPDATE place SET about = 'real later edit' WHERE id = ?", [ids[0]])
  const [edited] = await timestamps([ids[0]])
  assert.equal(edited.verified, before[0].verified, 'even other place edits cannot claim verification')
  assert.notEqual(edited.updated, before[0].updated, 'general edit time still advances')

  const [fresh] = await db.query(`INSERT INTO place (slug, name, name_normalized, source, source_id)
    VALUES ('qa-verified-timestamp-new', 'QA New', 'qa new', 'import', 990003)`)
  const [newPlace] = await timestamps([fresh.insertId])
  assert.equal(newPlace.verified, null, 'new imported cafes are not human-verified by default')
  assert.equal(newPlace.synced, null)
  await db.query('DELETE FROM place WHERE id IN (?, ?, ?)', [...ids, fresh.insertId])
  console.log('✓ legacy place/price ON UPDATE failures reproduced; both migrations, repeats, concurrent edit and fresh imports pass')
} finally {
  await db.end()
}
