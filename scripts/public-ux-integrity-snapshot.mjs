/** Read-only, consistent release evidence. Outputs hashes/counts, never row values or PII. */
import { createHash } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import mysql from 'mysql2/promise'

if (!process.env.DATABASE_URL) process.loadEnvFile(process.env.KUCAFE_ENV_FILE ?? '.env.local')
const connection = await mysql.createConnection(process.env.DATABASE_URL)
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const snapshot = { capturedAt: new Date().toISOString(), tables: {}, schema: '', migrations: {} }
try {
  await connection.query("SET time_zone = '+00:00'")
  await connection.query('SET TRANSACTION READ ONLY')
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')
  for (const table of ['place', 'menu_section', 'menu_item', 'menu_item_variant', 'user_place_role', 'menu_item_field_override', 'menu_section_field_override', 'venue_qr_link']) {
    const [rows] = await connection.query(`SELECT * FROM \`${table}\``)
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    snapshot.tables[table] = { count: rows.length, sha256: digest(rows) }
  }
  for (const [table, fields] of [
    ['review', 'id, place_id, status, stars, created_at'],
    ['booking_request', 'id, place_id, status, revision, updated_at'],
    ['venue_event', 'id, place_id, status, revision, updated_at'],
    ['event_participation', 'id, event_id, status, revision, updated_at'],
    ['venue_booking_settings', 'place_id, enabled, revision, updated_at'],
  ]) {
    const [rows] = await connection.query(`SELECT ${fields} FROM \`${table}\``)
    rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    snapshot.tables[table] = { count: rows.length, sha256: digest(rows) }
  }
  const [users] = await connection.query('SELECT COUNT(*) AS count FROM app_user')
  snapshot.tables.app_user = { count: Number(users[0].count) }
  const [roles] = await connection.query('SELECT status, COUNT(*) AS count FROM user_place_role GROUP BY status ORDER BY status')
  snapshot.roles = roles
  const [columns] = await connection.query(`SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`)
  const [indexes] = await connection.query(`SELECT TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE, INDEX_TYPE
    FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`)
  snapshot.schema = digest({ columns, indexes })
  const [migrationTables] = await connection.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE '%migration%' ORDER BY TABLE_NAME")
  for (const { TABLE_NAME: table } of migrationTables) {
    if (!/^[a-zA-Z0-9_]+$/.test(table)) throw new Error('Unexpected migration table')
    const [rows] = await connection.query(`SELECT * FROM \`${table}\``)
    snapshot.migrations[table] = { count: rows.length, sha256: digest(rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))) }
  }
  await connection.rollback()
} finally { await connection.end() }
const output = JSON.stringify(snapshot, null, 2)
if (process.argv[2]) await writeFile(process.argv[2], output + '\n', { mode: 0o600 })
console.log(output)
