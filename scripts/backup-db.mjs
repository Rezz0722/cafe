/**
 * backup فشرده و transaction-safe بدون نمایش credential در command line.
 *
 *   KUCAFE_ENV_FILE=/path/to/.env.local node scripts/backup-db.mjs backups/name.sql.gz
 */
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createGzip } from 'node:zlib'
import { once } from 'node:events'
import { pipeline } from 'node:stream/promises'
import { execFileSync, spawn } from 'node:child_process'

const destination = resolve(process.argv[2] ?? `backups/kucafe-${new Date().toISOString().slice(0, 10)}.sql.gz`)
const envFile = process.env.KUCAFE_ENV_FILE ?? '.env.local'

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(envFile)
  } catch (error) {
    console.error(`خواندن env شکست خورد: ${error.message}`)
    process.exit(1)
  }
}

const rawUrl = process.env.DATABASE_URL
if (!rawUrl) throw new Error('DATABASE_URL پیدا نشد.')
const url = new URL(rawUrl)
const database = url.pathname.replace(/^\//, '')
if (!database) throw new Error('نام دیتابیس در DATABASE_URL نیست.')

// Hosted CI has MySQL 8 mysqldump while the application database is MariaDB.
// MySQL 8 otherwise queries information_schema.COLUMN_STATISTICS, which
// MariaDB does not expose, and the required pre-apply backup fails.
let dumpVersion
try { dumpVersion = execFileSync('mysqldump', ['--version'], { encoding: 'utf8' }) }
catch { throw new Error('ابزار mysqldump برای بکاپ پیدا نشد یا اجرا نشد.') }
const mysqlClientMajor = Number(/\bVer\s+(\d+)/i.exec(dumpVersion)?.[1] ?? 0)
const disableColumnStatistics = !/mariadb/i.test(dumpVersion) && mysqlClientMajor >= 8

await mkdir(dirname(destination), { recursive: true })

const dump = spawn(
  'mysqldump',
  [
    '--single-transaction',
    '--skip-lock-tables',
    '--no-tablespaces',
    ...(disableColumnStatistics ? ['--column-statistics=0'] : []),
    '--default-character-set=utf8mb4',
    '--host', url.hostname,
    '--port', url.port || '3306',
    '--user', decodeURIComponent(url.username),
    database,
  ],
  {
    env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let stderr = ''
dump.stderr.setEncoding('utf8')
dump.stderr.on('data', (chunk) => { stderr += chunk })

const stream = pipeline(dump.stdout, createGzip({ level: 9 }), createWriteStream(destination))
const [code] = await once(dump, 'close')
await stream

if (code !== 0) {
  console.error(stderr.trim() || `mysqldump با کد ${code} متوقف شد.`)
  process.exit(Number(code) || 1)
}

console.log(`✓ backup ساخته شد: ${destination}`)
