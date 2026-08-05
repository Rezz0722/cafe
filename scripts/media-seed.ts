/**
 * پر کردن جدول `media` از آدرس‌های تصویرِ فایل منبع.
 *
 * جدا از دانلود است و عمداً: اول همه‌ی ۱۴٬۵۵۸ آدرس به‌عنوان `pending` ثبت
 * می‌شوند، بعد دانلودگر می‌تواند هر تعداد بار قطع و ازسرگیری شود. اگر ثبت و
 * دانلود یک مرحله بودند، هر قطعی وسط کار یعنی «نمی‌دانم کدام‌ها را رد کرده‌ام».
 *
 * idempotent است: اجرای دوباره آدرس‌های تکراری را رد می‌کند و فقط جدیدها را
 * اضافه می‌کند.
 *
 *   npx tsx scripts/media-seed.ts
 */

import { sql } from 'drizzle-orm'
import { extractSourceImages, readSourceCafes } from '../src/core/import/source'
import { hashUrl } from '../src/core/media/store'
import { closeDb, getDb } from '../src/db/connection'
import { media } from '../src/db/schema'

const CHUNK = 500

async function main() {
  const db = getDb()
  const cafes = readSourceCafes()
  const images = extractSourceImages(cafes)

  console.log(`منبع: ${cafes.length} مجموعه · ${images.length} آدرس تصویر یکتا`)

  const rows = images.map((image) => ({
    urlHash: hashUrl(image.url),
    sourceUrl: image.url,
    kind: image.kind,
    status: 'pending' as const,
  }))

  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    // آدرس‌هایی که از قبل ثبت شده‌اند دست نمی‌خورند — وضعیت `ok`شان پاک نشود.
    const result = await db
      .insert(media)
      .values(chunk)
      .onDuplicateKeyUpdate({ set: { urlHash: sql`url_hash` } })
    inserted += chunk.length
    process.stdout.write(`\rثبت: ${inserted}/${rows.length}`)
    void result
  }
  process.stdout.write('\n')

  const [stats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      pending: sql<number>`SUM(status = 'pending')`,
      ok: sql<number>`SUM(status = 'ok')`,
      failed: sql<number>`SUM(status = 'failed')`,
    })
    .from(media)

  console.log(
    `جدول media: ${stats?.total} کل · ${stats?.pending} در انتظار · ${stats?.ok} دانلودشده · ${stats?.failed} ناموفق`,
  )
  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
