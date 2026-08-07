/**
 * دامپِ فقط-داده، سازگار با MariaDB.
 *
 *   node scripts/db-dump.mjs out.sql              همه‌ی جدول‌ها
 *   node scripts/db-dump.mjs out.sql audit_log …  فقط جدول‌های نام‌برده
 *
 * ═══ چرا `mysqldump` نه ═══
 *
 * ۱. روی ماشین توسعه نصب نیست.
 * ۲. مهم‌تر: دامپِ MySQL 8 دستورهای DDL و `COLLATE utf8mb4_0900_*` دارد که
 *    MariaDB نمی‌شناسد. اینجا فقط ردیف‌ها بیرون می‌آیند و شما را روی مقصد
 *    `drizzle-kit` می‌سازد — پس هیچ ناسازگاریِ DDL پیش نمی‌آید.
 *
 * ═══ ⚠️ تله‌ی ستون JSON — دلیل وجود این فایل ═══
 *
 * MySQL 8 نوع بومیِ `json` دارد. MariaDB آن را `longtext` با
 * `CHECK (json_valid(col))` پیاده می‌کند.
 *
 * وقتی mysql2 یک ستون `json` را می‌خواند، **خودش JSON.parse می‌کند**. برای
 * ستونی که مقدارش رشته‌ی JSONیِ `"pending"` است، جاوااسکریپت رشته‌ی
 * `pending` می‌گیرد — که از یک `varchar` معمولی قابل تشخیص نیست. نسخه‌ی اول
 * این اسکریپت همان را بدون گیومه‌ی JSON بیرون داد و MariaDB با
 * `CHECK (json_valid('pending'))` ردش کرد:
 *
 *     ERROR 4025: CONSTRAINT `audit_log.before` failed
 *
 * پس فهرست ستون‌های `json` از `information_schema` خوانده می‌شود و مقدارشان
 * **همیشه** با `JSON.stringify` کدگذاری می‌شود، مستقل از تایپ جاوااسکریپتی‌اش.
 */

import { createConnection } from 'mysql2/promise'
import { readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BS = String.fromCharCode(92)

function connConfig() {
  const line = readFileSync('.env.local', 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL'))
  if (!line) throw new Error('DATABASE_URL در .env.local نیست')
  const url = new URL(line.split('=').slice(1).join('=').trim())
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    timezone: 'Z',
  }
}

/** رشته‌ی SQL امن. */
function quote(text) {
  const escaped = String(text)
    .split(BS)
    .join(BS + BS)
    .split("'")
    .join(BS + "'")
    .split('\n')
    .join(BS + 'n')
    .split('\r')
    .join(BS + 'r')
  return `'${escaped}'`
}

function literal(value, isJson) {
  if (value === null || value === undefined) return 'NULL'

  // ستون JSON: همیشه کدگذاری JSON، حتی اگر مقدارش عدد یا رشته‌ی ساده باشد.
  // بدون این، MariaDB با `json_valid()` ردش می‌کند.
  if (isJson) return quote(JSON.stringify(value))

  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) {
    const p = (n) => String(n).padStart(2, '0')
    return quote(
      `${value.getUTCFullYear()}-${p(value.getUTCMonth() + 1)}-${p(value.getUTCDate())} ` +
        `${p(value.getUTCHours())}:${p(value.getUTCMinutes())}:${p(value.getUTCSeconds())}`,
    )
  }
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  if (typeof value === 'object') return quote(JSON.stringify(value))
  return quote(value)
}

const ROWS_PER_INSERT = 200

async function main() {
  const outPath = process.argv[2]
  if (!outPath) {
    console.error('استفاده: node scripts/db-dump.mjs <out.sql> [جدول …]')
    process.exit(1)
  }
  const only = process.argv.slice(3)

  const conn = await createConnection(connConfig())
  await conn.query("SET time_zone='+00:00'")

  const [jsonCols] = await conn.query(
    "SELECT table_name t, column_name c FROM information_schema.columns " +
      "WHERE table_schema=DATABASE() AND data_type='json'",
  )
  /** `table.column` هایی که باید JSON کدگذاری شوند. */
  const jsonSet = new Set(jsonCols.map((r) => `${r.t}.${r.c}`))

  const [tableRows] = await conn.query(
    "SELECT table_name t FROM information_schema.tables " +
      "WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY table_name",
  )
  const tables = tableRows
    .map((r) => r.t)
    .filter((t) => t !== '__drizzle_migrations')
    .filter((t) => only.length === 0 || only.includes(t))

  const out = ['SET NAMES utf8mb4;', 'SET FOREIGN_KEY_CHECKS=0;', "SET time_zone='+00:00';"]
  let total = 0

  for (const table of tables) {
    const [rows] = await conn.query('SELECT * FROM `' + table + '`')
    if (rows.length === 0) continue
    const cols = Object.keys(rows[0])
    const jsonFlags = cols.map((c) => jsonSet.has(`${table}.${c}`))

    out.push('', `-- ${table}: ${rows.length} ردیف`)
    out.push('DELETE FROM `' + table + '`;')
    for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
      const chunk = rows.slice(i, i + ROWS_PER_INSERT)
      out.push('INSERT INTO `' + table + '` (`' + cols.join('`,`') + '`) VALUES')
      out.push(
        chunk
          .map((r) => '(' + cols.map((c, j) => literal(r[c], jsonFlags[j])).join(',') + ')')
          .join(',\n') + ';',
      )
    }
    total += rows.length
    const marks = cols.filter((_, j) => jsonFlags[j])
    console.error(
      `  ${table.padEnd(22)}${String(rows.length).padStart(6)}` +
        (marks.length ? `   json: ${marks.join(', ')}` : ''),
    )
  }

  out.push('', 'SET FOREIGN_KEY_CHECKS=1;')
  const text = out.join('\n') + '\n'
  writeFileSync(outPath, text)
  writeFileSync(`${outPath}.gz`, gzipSync(Buffer.from(text), { level: 9 }))

  console.error(
    `\nمجموع ${total} ردیف در ${tables.length} جدول → ${outPath} ` +
      `(${(text.length / 1048576).toFixed(1)}MB، gz ${(gzipSync(Buffer.from(text)).length / 1024).toFixed(0)}KB)`,
  )
  await conn.end()
}

main().catch((error) => {
  console.error('دامپ شکست خورد:', error.message)
  process.exit(1)
})
