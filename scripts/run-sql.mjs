/**
 * اجرای یک فایل SQL روی دیتابیس.
 *
 * لازم است چون `drizzle-kit push` ایندکس FULLTEXT را تولید نمی‌کند و نمی‌خواهیم
 * اجرای آن به نصب کلاینت `mysql.exe` روی ماشین وابسته باشد.
 *
 *   node scripts/run-sql.mjs drizzle/mysql-extras.sql
 *
 * دستورها یکی‌یکی اجرا می‌شوند و خطای «قبلاً وجود دارد» نادیده گرفته می‌شود،
 * پس اجرای دوباره‌ی فایل بی‌خطر است (idempotent).
 */

import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

const file = process.argv[2]
if (!file) {
  console.error('استفاده: node scripts/run-sql.mjs <file.sql>')
  process.exit(1)
}

const url = process.env.DATABASE_URL ?? readEnvLocal('DATABASE_URL')
if (!url) {
  console.error('DATABASE_URL پیدا نشد (نه در محیط، نه در .env.local)')
  process.exit(1)
}

function readEnvLocal(key) {
  try {
    const text = readFileSync('.env.local', 'utf8')
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

/** خطاهایی که «یعنی از قبل انجام شده» — نه شکست. */
const BENIGN = new Set(['ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME', 'ER_TABLE_EXISTS_ERROR'])

const sql = readFileSync(file, 'utf8')
const statements = sql
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) =>
    s
      .split(/\r?\n/)
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n')
      .trim(),
  )
  .filter(Boolean)

const conn = await mysql.createConnection({ uri: url, charset: 'utf8mb4' })
let applied = 0
let skipped = 0

for (const statement of statements) {
  try {
    await conn.query(statement)
    applied++
    console.log(`✓ ${statement.slice(0, 70).replace(/\s+/g, ' ')}…`)
  } catch (error) {
    if (BENIGN.has(error.code)) {
      skipped++
      console.log(`· از قبل موجود: ${statement.slice(0, 60).replace(/\s+/g, ' ')}…`)
    } else {
      console.error(`✗ ${statement.slice(0, 80).replace(/\s+/g, ' ')}`)
      console.error(`  ${error.code}: ${error.message}`)
      await conn.end()
      process.exit(1)
    }
  }
}

await conn.end()
console.log(`\n${applied} اجرا شد · ${skipped} از قبل موجود بود`)
