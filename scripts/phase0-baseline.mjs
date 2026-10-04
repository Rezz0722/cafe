/** Read-only, aggregate production inventory. No phones, queries or secrets in output. */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import mysql from 'mysql2/promise'

process.loadEnvFile(process.env.KUCAFE_ENV_FILE ?? '.env.local')
const output = process.argv[2] ?? 'var/qa/phase0/database-baseline.json'
const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, charset: 'utf8mb4' })
const report = { capturedAt: new Date().toISOString(), counts: {}, schema: [], analytics: {}, otpSettings: [] }
try {
  await db.query('SET SESSION TRANSACTION READ ONLY')
  await db.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')
  for (const table of ['place', 'menu_section', 'menu_item', 'media', 'app_user', 'user_place_role', 'review', 'place_attribute']) {
    const [rows] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``)
    report.counts[table] = Number(rows[0].total)
  }
  const [published] = await db.query("SELECT COUNT(*) AS total FROM place WHERE status = 'published'")
  report.counts.publishedPlaces = Number(published[0].total)
  const [coverage] = await db.query("SELECT COUNT(DISTINCT a.place_id) AS total FROM place_attribute a JOIN place p ON p.id = a.place_id WHERE p.status = 'published' AND a.value > 0")
  report.counts.publishedWithPositiveAttribute = Number(coverage[0].total)
  const [tables] = await db.query('SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME')
  report.schema = tables
  const [views] = await db.query('SELECT device, COUNT(*) AS views FROM page_view WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY GROUP BY device')
  const [searches] = await db.query('SELECT resolved_entity AS entity, COUNT(*) AS records, SUM(result_count = 0) AS zeroResults FROM search_log WHERE created_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY GROUP BY resolved_entity')
  report.analytics = { window: 'last 7 days at capture', pageViews: views, searchLog: searches, limitation: 'Current search page logs zero results only; these records cannot establish a zero-result rate or total search usage. Page views may contain QA traffic.' }
  const [settings] = await db.query("SELECT `key`, value FROM setting WHERE `key` IN ('authDevMode', 'otpTtlSeconds', 'otpResendCooldownSeconds')")
  report.otpSettings = settings
  report.otpSettingsNote = 'Only stored overrides are listed. Missing keys use registry defaults; an empty array does not mean OTP is disabled. Current code defaults: TTL 60s, resend cooldown 90s.'
  await db.rollback()
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(report, null, 2))
  console.log(`Aggregate baseline saved: ${output}`)
} finally {
  await db.end()
}
