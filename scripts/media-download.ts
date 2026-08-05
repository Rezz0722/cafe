/**
 * دانلود تصاویر `media` به `public/media/`.
 *
 * ═══ ویژگی‌هایی که برای ۱۴هزار دانلود واجب‌اند ═══
 *
 *   • **ازسرگیری** — وضعیت هر ردیف در دیتابیس است. Ctrl+C بزنید و دوباره
 *     اجرا کنید؛ از همان‌جا ادامه می‌دهد.
 *   • **همروندی محدود** — ۱۲ درخواست هم‌زمان. بیشتر از این، CDN شروع می‌کند
 *     به بستن اتصال (و ما هم عملاً داریم به یک سرور شخص‌ثالث فشار می‌آوریم).
 *   • **تلاش مجدد با backoff** — خطای شبکه‌ی گذرا با ۳ تلاش رد می‌شود.
 *     ۴۰۴ تلاش مجدد نمی‌گیرد چون بی‌فایده است.
 *   • **یکتاسازی محتوا** — دو آدرس متفاوت با محتوای یکسان یک فایل می‌شوند
 *     (`content_hash`). در داده‌ی واقعی تصویر لوگو در چند مجموعه تکرار شده.
 *   • **کشفِ فایلِ موجود** — اگر فایل روی دیسک باشد ولی وضعیت DB `pending`
 *     مانده باشد (مثلاً برق رفته)، دوباره دانلود نمی‌شود.
 *
 *   npx tsx scripts/media-download.ts            # همه‌ی pending و failed
 *   npx tsx scripts/media-download.ts --limit 50 # فقط ۵۰ تا (برای آزمایش)
 *   npx tsx scripts/media-download.ts --retry    # ناموفق‌ها را از صفر
 */

import { existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { and, eq, isNotNull, lt, or, sql } from 'drizzle-orm'
import { deriveImage } from '../src/core/media/derive'
import {
  hashContent,
  mediaFullPath,
  mediaRelativePath,
  type MediaKind,
} from '../src/core/media/store'
import { closeDb, getDb } from '../src/db/connection'
import { media } from '../src/db/schema'

const CONCURRENCY = 12
const MAX_ATTEMPTS = 3
const TIMEOUT_MS = 30_000
const PUBLIC_DIR = resolve(process.cwd(), 'public')

const args = process.argv.slice(2)
const limitArg = args.indexOf('--limit')
const LIMIT = limitArg > -1 ? Number(args[limitArg + 1]) : 0
const RETRY_ALL = args.includes('--retry')

interface Row {
  id: number
  urlHash: string
  sourceUrl: string
  kind: MediaKind
  attempts: number
}

const stats = {
  ok: 0,
  reused: 0,
  onDisk: 0,
  failed: 0,
  /** حجم ذخیره‌شده روی دیسک (دو نسخه‌ی WebP). */
  bytes: 0,
  /** حجم دانلودشده از CDN — برای نشان‌دادن نسبت صرفه‌جویی. */
  sourceBytes: 0,
}

/** hash محتوا → مسیر لوکالِ قبلاً ذخیره‌شده. برای یکتاسازی بین آدرس‌ها. */
const contentIndex = new Map<string, string>()

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        // بعضی CDNها بدون User-Agent شبیه‌مرورگر، ۴۰۳ می‌دهند.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/webp,image/avif,image/*,*/*;q=0.8',
      },
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timer)
  }
}

async function downloadOne(db: ReturnType<typeof getDb>, row: Row): Promise<void> {
  // ── فایل از قبل روی دیسک است؟ (اجرای قطع‌شده‌ی قبلی)
  // هر دو نسخه باید موجود باشند، وگرنه دوباره ساخته می‌شود: اگر فقط کارت
  // نوشته شده باشد، lightbox روی ۴۰۴ می‌افتد.
  const targetPath = mediaRelativePath(row.kind, row.urlHash)
  const cardAbs = resolve(PUBLIC_DIR, targetPath)
  const fullAbs = resolve(PUBLIC_DIR, mediaFullPath(targetPath))
  if (existsSync(cardAbs) && existsSync(fullAbs)) {
    const size = statSync(cardAbs).size
    if (size > 0) {
      await db
        .update(media)
        .set({ status: 'ok', localPath: targetPath, bytes: size, fetchedAt: new Date() })
        .where(eq(media.id, row.id))
      stats.onDisk++
      return
    }
  }

  let lastError = ''
  for (let attempt = row.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(row.sourceUrl)

      if (!response.ok) {
        lastError = `HTTP ${response.status}`
        // ۴xx (جز ۴۲۹) با تلاش مجدد درست نمی‌شود.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) break
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
        continue
      }

      const buf = Buffer.from(await response.arrayBuffer())
      if (buf.length === 0) {
        lastError = 'پاسخ خالی'
        break
      }

      const contentHash = hashContent(buf)

      // ── همان محتوا قبلاً ذخیره شده؟ فقط به همان فایل اشاره کن.
      const existingPath = contentIndex.get(contentHash)
      if (existingPath) {
        await db
          .update(media)
          .set({
            status: 'ok',
            localPath: existingPath,
            contentHash,
            bytes: buf.length,
            fetchedAt: new Date(),
            error: null,
          })
          .where(eq(media.id, row.id))
        stats.reused++
        return
      }

      // ── تبدیل به دو نسخه‌ی WebP. اصلِ فایل ذخیره نمی‌شود.
      const derived = await deriveImage(buf)
      if (!derived) {
        lastError = 'قابل decode نبود'
        break
      }

      const relative = mediaRelativePath(row.kind, row.urlHash)
      const absolute = resolve(PUBLIC_DIR, relative)
      await mkdir(dirname(absolute), { recursive: true })
      await Promise.all([
        writeFile(absolute, derived.card.buffer),
        writeFile(resolve(PUBLIC_DIR, mediaFullPath(relative)), derived.full.buffer),
      ])

      contentIndex.set(contentHash, relative)
      const storedBytes = derived.card.buffer.length + derived.full.buffer.length

      await db
        .update(media)
        .set({
          status: 'ok',
          localPath: relative,
          contentHash,
          bytes: storedBytes,
          // ابعادِ نسخه‌ی کارت ثبت می‌شود، نه اصل: همین است که در تگ `img`
          // می‌رود و از پریدنِ چیدمان جلو می‌گیرد.
          width: derived.card.width,
          height: derived.card.height,
          format: 'webp',
          fetchedAt: new Date(),
          error: null,
          attempts: attempt + 1,
        })
        .where(eq(media.id, row.id))

      stats.ok++
      stats.bytes += storedBytes
      stats.sourceBytes += buf.length
      return
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }

  await db
    .update(media)
    .set({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      error: lastError.slice(0, 250),
    })
    .where(eq(media.id, row.id))
  stats.failed++
}

/** استخر کارگرها — همروندی ثابت بدون ساختن ۱۴هزار promise هم‌زمان. */
async function runPool(rows: Row[], worker: (row: Row) => Promise<void>): Promise<void> {
  let index = 0
  let done = 0
  const total = rows.length
  const started = Date.now()

  const tick = () => {
    done++
    if (done % 25 === 0 || done === total) {
      const elapsed = (Date.now() - started) / 1000
      const rate = done / Math.max(elapsed, 0.001)
      const eta = rate > 0 ? Math.round((total - done) / rate) : 0
      process.stdout.write(
        `\r${done}/${total} · ${stats.ok} جدید · ${stats.reused} تکراری · ${stats.onDisk} موجود · ${stats.failed} ناموفق · ${(stats.bytes / 1024 / 1024).toFixed(0)}MB · ${rate.toFixed(1)}/ث · ETA ${Math.floor(eta / 60)}د  `,
      )
    }
  }

  const runners = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
    while (index < total) {
      const row = rows[index++]!
      try {
        await worker(row)
      } catch (error) {
        // یک ردیفِ ترکیده نباید کل دانلود را بخواباند.
        console.error(`\nخطای غیرمنتظره روی ${row.sourceUrl}:`, error)
        stats.failed++
      }
      tick()
    }
  })

  await Promise.all(runners)
  process.stdout.write('\n')
}

async function main() {
  const db = getDb()

  // ── ایندکس محتوای قبلی، تا اجرای دوباره فایل تکراری نسازد
  const known = await db
    .select({ contentHash: media.contentHash, localPath: media.localPath })
    .from(media)
    .where(and(eq(media.status, 'ok'), isNotNull(media.contentHash), isNotNull(media.localPath)))
  for (const row of known) {
    if (row.contentHash && row.localPath) contentIndex.set(row.contentHash, row.localPath)
  }
  console.log(`${contentIndex.size} محتوای یکتای از قبل دانلودشده`)

  if (RETRY_ALL) {
    const reset = await db
      .update(media)
      .set({ status: 'pending', attempts: 0, error: null })
      .where(eq(media.status, 'failed'))
    console.log('ناموفق‌ها به وضعیت pending برگشتند', reset)
  }

  const where = or(
    eq(media.status, 'pending'),
    and(eq(media.status, 'failed'), lt(media.attempts, MAX_ATTEMPTS)),
  )
  const query = db
    .select({
      id: media.id,
      urlHash: media.urlHash,
      sourceUrl: media.sourceUrl,
      kind: media.kind,
      attempts: media.attempts,
    })
    .from(media)
    .where(where)
    .orderBy(media.id)

  const rows = (LIMIT > 0 ? await query.limit(LIMIT) : await query) as Row[]

  if (rows.length === 0) {
    console.log('چیزی برای دانلود نمانده.')
    await closeDb()
    return
  }

  console.log(`${rows.length} تصویر برای دانلود · همروندی ${CONCURRENCY}\n`)
  await runPool(rows, (row) => downloadOne(db, row))

  const [summary] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      ok: sql<number>`SUM(status = 'ok')`,
      failed: sql<number>`SUM(status = 'failed')`,
      pending: sql<number>`SUM(status = 'pending')`,
      bytes: sql<number>`COALESCE(SUM(bytes), 0)`,
      files: sql<number>`COUNT(DISTINCT local_path)`,
      sized: sql<number>`SUM(width IS NOT NULL)`,
    })
    .from(media)

  console.log('\n── خلاصه ──')
  console.log(`کل ردیف: ${summary?.total}`)
  console.log(`دانلودشده: ${summary?.ok} · ناموفق: ${summary?.failed} · باقی: ${summary?.pending}`)
  console.log(`فایل یکتا روی دیسک: ${summary?.files} (×۲ نسخه: کارت و بزرگ)`)
  console.log(`حجم ذخیره‌شده: ${((summary?.bytes ?? 0) / 1024 / 1024).toFixed(1)} MB`)
  console.log(`با ابعاد ثبت‌شده: ${summary?.sized}`)
  if (stats.sourceBytes > 0) {
    const saved = 1 - stats.bytes / stats.sourceBytes
    console.log(
      `صرفه‌جویی این اجرا: ${(stats.sourceBytes / 1024 / 1024).toFixed(0)}MB دانلود → ${(stats.bytes / 1024 / 1024).toFixed(0)}MB ذخیره (${(saved * 100).toFixed(0)}٪ کمتر)`,
    )
  }

  if ((summary?.failed ?? 0) > 0) {
    const worst = await db
      .select({ error: media.error, n: sql<number>`COUNT(*)` })
      .from(media)
      .where(eq(media.status, 'failed'))
      .groupBy(media.error)
      .orderBy(sql`COUNT(*) DESC`)
      .limit(8)
    console.log('\nدلایل شکست:')
    for (const row of worst) console.log(`  ${row.n}× ${row.error}`)
  }

  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
