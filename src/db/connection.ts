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
import { AsyncLocalStorage } from 'node:async_hooks'
import { ensureEnvLoaded } from '@/core/config/loadEnv'
import * as schema from './schema'

export type Db = MySql2Database<typeof schema>

interface DbCache {
  pool?: mysql.Pool
  db?: Db
}

const cache = globalThis as unknown as { __cafegardDb?: DbCache }
cache.__cafegardDb ??= {}
const transactions = new AsyncLocalStorage<{ db: Db; committed: (() => void)[] }>()

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

  /*
    ═══ منطقه‌ی زمانیِ **نشست**، روی هر اتصال ═══

    `timezone: 'Z'` بالا فقط تبدیلِ JS ↔ رشته را کنترل می‌کند، نه منطقه‌ی
    زمانیِ خودِ سرور دیتابیس. برای ستون‌های `TIMESTAMP` این کافی نیست:
    MySQL/MariaDB مقدار را در ذخیره از منطقه‌ی نشست به UTC و در خواندن از UTC
    به منطقه‌ی نشست تبدیل می‌کند. اگر منطقه‌ی نشست UTC نباشد، درایور رشته‌ی
    محلی را به‌عنوان UTC می‌خواند و تایم‌استمپ به‌اندازه‌ی افستِ سرور جابه‌جا
    می‌شود.

    این روی سرور تولید واقعی دیده شد: منطقه‌ی زمانیِ سیستم `Asia/Tehran` بود و
    `@@time_zone` روی `SYSTEM`، یعنی هر `created_at` سه ساعت و نیم جلو خوانده
    می‌شد — و «الان باز است؟» و ترتیب نظرها با آن غلط می‌شدند.

    ═══ چرا اینجا و نه در `my.cnf` سرور ═══

    عوض‌کردن `default-time-zone` در تنظیمات سرور، **همه‌ی** دیتابیس‌های آن
    ماشین را عوض می‌کند. روی سروری که سایت‌ها و میل‌سرورِ دیگری هم دارد، این
    یک تغییرِ سراسری برای رفعِ مسئله‌ی یک اپ است. با ست‌کردن روی نشست، اپ ما
    روی هر سروری با هر منطقه‌ی زمانی درست کار می‌کند و هیچ‌چیز دیگری را
    دست نمی‌زند.

    رویداد `connection` روی هر اتصالِ **تازه‌ی** استخر شلیک می‌شود (نه هر
    درخواست)، پس هزینه‌اش عملاً صفر است.
  */
  /*
    `pool` از `mysql2/promise` است ولی رویداد `connection` اتصالِ **سبکِ
    callback** را می‌دهد، نه نسخه‌ی promise. پس `query` با callback صدا زده
    می‌شود؛ امضایش را صریح تایپ می‌کنیم چون تایپ‌های mysql2 در این نقطه
    overload چندگانه دارند و استنتاج به `any` می‌افتد.
  */
  pool.on('connection', (connection) => {
    ;(connection as unknown as {
      query: (sql: string, cb: (error: Error | null) => void) => void
    }).query("SET time_zone = '+00:00'", (error) => {
      if (!error) return
      // اتصال را نمی‌بندیم: بهتر است اپ با هشدار کار کند تا اینکه بالا نیاید.
      // ولی سکوت نمی‌کنیم، چون داده‌ی زمانی بی‌صدا خراب می‌شود.
      console.error('SET time_zone روی اتصال دیتابیس شکست خورد:', error.message)
    })
  })

  cache.__cafegardDb!.pool = pool
  return pool
}

export function getDb(): Db {
  const active = transactions.getStore()
  if (active) return active.db
  cache.__cafegardDb!.db ??= drizzle(getPool(), { schema, mode: 'default' })
  return cache.__cafegardDb!.db!
}

/** Request-local transaction: repositories called below share the same connection. */
export async function withDbTransaction<T>(work: () => Promise<T>): Promise<T> {
  const parent = transactions.getStore()
  if (parent) {
    const effects: (() => void)[] = []
    const value = await parent.db.transaction(tx => transactions.run({ db: tx as unknown as Db, committed: effects }, work))
    parent.committed.push(...effects)
    return value
  }
  const committed: (() => void)[] = []
  const value = await getDb().transaction(tx => transactions.run({ db: tx as unknown as Db, committed }, work))
  for (const effect of committed) {
    try { effect() } catch { console.warn('[db] post-commit cache invalidation failed; data is committed') }
  }
  return value
}

export function afterDbCommit(effect: () => void): void {
  const active = transactions.getStore()
  if (active) active.committed.push(effect)
  else effect()
}

export function inDbTransaction(): boolean { return Boolean(transactions.getStore()) }

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
