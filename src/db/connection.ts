/**
 * استخر اتصال MySQL — بدون `server-only`.
 *
 * ═══ چرا این فایل از `client.ts` جدا است ═══
 *
 * `client.ts` با `server-only` علامت‌گذاری شده تا اگر کسی اشتباهی دیتابیس را
 * در یک client component import کرد، build بشکند. ولی اسکریپت‌های CLI
 * (ایمپورت، دانلود تصویر، ساخت تایل) هم به همان استخر نیاز دارند و
 * `server-only` در اجرای مستقیم Node می‌ترکد.
 *
 * پس منطق اتصال اینجاست و `client.ts` فقط یک لایه‌ی نازکِ محافظ روی آن است:
 *
 *   کد اپ    → `@/db/client`      (محافظت‌شده)
 *   اسکریپت  → `../src/db/connection`
 *
 * ═══ تنظیمات مهم ═══
 *
 *   • `timezone: 'Z'` — تایم‌استمپ‌ها UTC خوانده و نوشته می‌شوند. بدون این،
 *     درایور از منطقه‌ی زمانی سیستم استفاده می‌کند و یک لحظه‌ی یکسان روی
 *     ماشین توسعه و سرور دو مقدار مختلف می‌شود.
 *   • `DECIMAL` رشته برمی‌گردد (پیش‌فرض درایور) و عمداً همین را می‌خواهیم:
 *     تبدیل خودکار به float رقم هفتم اعشار مختصات را بی‌صدا خراب می‌کند و
 *     آن رقم حدود ۱ سانتی‌متر نیست — روی طول جغرافیایی حدود ۹ سانتی‌متر است،
 *     ولی خطای انباشته در محاسبات فاصله دیده می‌شود.
 *   • `globalThis` — Next.js در توسعه ماژول‌ها را با هر تغییر فایل از نو بار
 *     می‌کند؛ بدون کش، هر hot-reload یک استخر تازه باز می‌کند و MySQL بعد از
 *     چند دقیقه `ER_CON_COUNT_ERROR` می‌دهد.
 */

import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import { ensureEnvLoaded } from '@/core/config/loadEnv'
import * as schema from './schema'

export type Db = MySql2Database<typeof schema>

interface DbCache {
  pool?: mysql.Pool
  db?: Db
}

const cache = globalThis as unknown as { __cafegardDb?: DbCache }
cache.__cafegardDb ??= {}

export function getPool(): mysql.Pool {
  const existing = cache.__cafegardDb!.pool
  if (existing) return existing

  ensureEnvLoaded()
  const url = process.env.DATABASE_URL?.trim()
  if (!url) {
    throw new Error(
      'DATABASE_URL تنظیم نشده است.\n' +
        'نمونه: DATABASE_URL=mysql://cafegard:رمز@127.0.0.1:3306/cafegard\n' +
        'آن را در `.env.local` بگذارید.',
    )
  }

  const pool = mysql.createPool({
    uri: url,
    charset: 'utf8mb4',
    timezone: 'Z',
    connectionLimit: 10,
    waitForConnections: true,
    enableKeepAlive: true,
    // چنددستوری را باز نمی‌کنیم — سطح حمله‌ی تزریق SQL را گسترده می‌کند.
    multipleStatements: false,
  })
  cache.__cafegardDb!.pool = pool
  return pool
}

export function getDb(): Db {
  cache.__cafegardDb!.db ??= drizzle(getPool(), { schema, mode: 'default' })
  return cache.__cafegardDb!.db!
}

/** برای اسکریپت‌ها: اتصال را ببند تا فرآیند Node تمام شود. */
export async function closeDb(): Promise<void> {
  const pool = cache.__cafegardDb?.pool
  if (!pool) return
  await pool.end()
  cache.__cafegardDb!.pool = undefined
  cache.__cafegardDb!.db = undefined
}

/** آیا دیتابیس در دسترس است؟ برای نمایش وضعیت در پنل ادمین. */
export async function pingDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    const conn = await getPool().getConnection()
    try {
      await conn.query('SELECT 1')
      return { ok: true }
    } finally {
      conn.release()
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export { schema }
