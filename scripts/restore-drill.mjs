/** Restore a specified SQL.gz into an isolated, disposable MariaDB, never the live DB. */
import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const backup = process.argv[2] && resolve(process.argv[2])
if (!backup?.endsWith('.sql.gz')) throw new Error('Usage: node scripts/restore-drill.mjs /absolute/backup.sql.gz [report.json]')
const info = await stat(backup)
if (!info.isFile()) throw new Error('Backup must be a regular file')
const output = process.argv[3] ?? 'var/qa/phase0/restore-drill.json'
const container = `kucafe-restore-drill-${process.pid}`
const startedAt = Date.now()
const run = (args, env = process.env) => new Promise((resolveResult, reject) => {
  const child = spawn('docker', args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = '', stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('error', reject)
  child.on('close', code => code === 0 ? resolveResult(stdout.trim()) : reject(new Error(`Docker command failed (${code}): ${stderr.slice(-1200)}`)))
})
let created = false
try {
  await run(['run', '-d', '--name', container, '--network', 'none', '--cpus', '1', '--memory', '1g', '--label', 'ir.kucafe.purpose=restore-drill', '-e', 'MARIADB_ROOT_PASSWORD', '-e', 'MARIADB_DATABASE=kucafe', 'mariadb:11.4'], { ...process.env, MARIADB_ROOT_PASSWORD: randomBytes(24).toString('hex') })
  created = true
  const client = ['exec', container, 'sh', '-c']
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await run([...client, 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" mariadb --user=root --execute="SELECT 1" kucafe'])
      ready = true
      break
    } catch { await new Promise(resolveWait => setTimeout(resolveWait, 1000)) }
  }
  if (!ready) throw new Error('Isolated database did not become ready')
  const child = spawn('docker', ['exec', '-i', container, 'sh', '-c', 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root kucafe'], { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', chunk => { stderr += chunk })
  const completion = new Promise((resolveResult, reject) => {
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolveResult() : reject(new Error(`Import failed (${code}): ${stderr.slice(-1200)}`)))
  })
  await Promise.all([pipeline(createReadStream(backup), createGunzip(), child.stdin), completion])
  const sql = [
    "SELECT 'tables', COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'kucafe'",
    ...['place', 'menu_section', 'menu_item', 'media', 'app_user', 'user_place_role', 'review', 'place_attribute'].map(table => `SELECT '${table}', COUNT(*) FROM ${table}`),
    "SELECT 'missing_public_ids', COUNT(*) FROM menu_item WHERE public_id IS NULL OR public_id = ''",
    "SELECT 'duplicate_public_ids', COUNT(*) FROM (SELECT public_id FROM menu_item GROUP BY public_id HAVING COUNT(*) > 1) ids",
    "SELECT 'orphan_menu_items', COUNT(*) FROM menu_item i LEFT JOIN place p ON p.id = i.place_id WHERE p.id IS NULL",
    "SELECT 'fulltext_indexes', COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = 'kucafe' AND INDEX_NAME IN ('place_name_ft','menu_item_name_ft','review_text_ft') AND INDEX_TYPE = 'FULLTEXT'",
  ].join('; ')
  const raw = await run([...client, 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb --user=root --batch --skip-column-names kucafe --execute "$1"', 'restore-check', sql])
  const counts = Object.fromEntries(raw.split('\n').map(line => { const [key, value] = line.split('\t'); return [key, Number(value)] }))
  if (counts.tables < 31 || counts.menu_item < 1 || counts.place < 1 || counts.fulltext_indexes !== 3 || counts.missing_public_ids || counts.duplicate_public_ids || counts.orphan_menu_items) throw new Error('Restored data failed schema/identity checks')
  const result = { verifiedAt: new Date().toISOString(), backup: backup.split('/').pop(), backupBytes: info.size, backupModifiedAt: info.mtime.toISOString(), elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), isolated: { network: 'none', publishedPorts: 0, memory: '1g', productionDatabaseTouched: false }, counts }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2))
  console.log(`Restore verified in ${result.elapsedSeconds}s; aggregate report: ${output}`)
} finally {
  if (created) await run(['rm', '-f', '-v', container])
}
