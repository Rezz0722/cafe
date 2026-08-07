/**
 * نوشتن واژگان ویژگی‌ها در دیتابیس.
 *
 *   npm run attributes:seed
 *
 * idempotent است: upsert می‌کند تا شناسه‌ها پایدار بمانند — شناسه‌ی ویژگی در
 * URL فیلترها می‌آید (`/search?a=laptop_friendly`)، پس عوض‌شدنش لینک‌های
 * ذخیره‌شده و ایندکس گوگل را می‌شکند.
 *
 * ═══ چرا این اسکریپت برچسبی به مکان‌ها نمی‌زند ═══
 *
 * برخلاف `build:facets` که facetها را از منوی واقعی استخراج می‌کند، ویژگی
 * قابل استخراج نیست. اسکیما خودش این را گفته: «facet از منوی واقعی استخراج
 * می‌شود (قابل اثبات)، ولی attribute قضاوت است». داده‌ی منبع هم هیچ فیلدی
 * برای فضا و امکانات ندارد و `place.about` شعار تبلیغاتی است، نه توصیف:
 * «جان، نه آنگونه که گفتند و شنیدی».
 *
 * تطبیق روی متن منو هم امتحان شد و رد شد: مترادف‌های `cozy` شامل «گرم» است و
 * دسته‌ی «نوشیدنی گرم» در ۱۰۲ مکان وجود دارد — نتیجه‌اش برچسب‌خوردنِ تقریباً
 * هر کافه به «دنج» بود. برچسبِ غلط بدتر از نبودِ برچسب است، چون کاربر روی
 * فیلتر کلیک می‌کند و به جایی می‌رسد که آن‌طور نیست.
 *
 * پس `place_attribute` از پنل پر می‌شود: مالک کافه و ادمین ثبت می‌کنند، با
 * `source` و `verified_at` که همین اسکیما برایشان جا گذاشته.
 */

import { sql } from 'drizzle-orm'
import { ATTRIBUTES, FILTER_ATTRIBUTES, INTENT_ATTRIBUTES } from '../src/core/taxonomy/attributes'
import { closeDb, getDb } from '../src/db/connection'
import { attribute as attributeTable } from '../src/db/schema'

async function main() {
  const db = getDb()

  console.log('نوشتن ویژگی‌ها…')
  for (const def of ATTRIBUTES) {
    const values = {
      id: def.id,
      labelFa: def.labelFa,
      kind: def.kind,
      isFilter: def.isFilter,
      sortOrder: def.sortOrder,
      hint: def.hint ?? null,
    }
    await db.insert(attributeTable).values(values).onDuplicateKeyUpdate({
      set: {
        labelFa: values.labelFa,
        kind: values.kind,
        isFilter: values.isFilter,
        sortOrder: values.sortOrder,
        hint: values.hint,
      },
    })
  }

  /*
    ویژگی‌ای که از فهرست کد حذف شده ولی در دیتابیس مانده، باید برود — وگرنه
    فیلتری در URL زنده می‌ماند که هیچ برچسبی برایش نیست. `place_attribute` با
    کلید خارجی به این جدول وصل است، پس ردیف‌های استفاده‌شده حذف نمی‌شوند و
    خطای کلید خارجی هم رخ نمی‌دهد.
  */
  const ids = ATTRIBUTES.map((a) => a.id)
  const orphans = await db.execute(sql`
    DELETE FROM attribute
    WHERE id NOT IN ${ids}
      AND id NOT IN (SELECT DISTINCT attribute_id FROM place_attribute)
  `)

  const [coverage] = (await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM attribute) AS attributes,
      (SELECT COUNT(*) FROM place_attribute) AS tags,
      (SELECT COUNT(DISTINCT place_id) FROM place_attribute WHERE value >= 1) AS tagged_places,
      (SELECT COUNT(*) FROM place WHERE status = 'published') AS published
  `)) as unknown as [
    { attributes: number; tags: number; tagged_places: number; published: number }[],
  ]

  const row = coverage[0]!
  const fa = (n: number) => n.toLocaleString('fa-IR')

  console.log(`  ${fa(ATTRIBUTES.length)} ویژگی نوشته شد`)
  console.log(`  ${fa(FILTER_ATTRIBUTES.length)} فیلترپذیر · ${fa(INTENT_ATTRIBUTES.length)} نیت`)
  if ((orphans as unknown as { affectedRows?: number }).affectedRows) {
    console.log(`  ${fa(Number((orphans as unknown as { affectedRows: number }).affectedRows))} ویژگی‌ی متروک پاک شد`)
  }
  console.log('')
  console.log('پوشش برچسب مکان‌ها:')
  console.log(`  ${fa(Number(row.tagged_places))} از ${fa(Number(row.published))} مکان منتشرشده برچسب دارد`)
  console.log(`  ${fa(Number(row.tags))} ردیف place_attribute`)

  if (Number(row.tags) === 0) {
    console.log('')
    console.log('هیچ برچسبی ثبت نشده. این طبیعی است — ویژگی‌ها از پنل پر می‌شوند،')
    console.log('نه از ایمپورت. تا آن‌موقع فیلترهای نیت صفر نتیجه می‌دهند و')
    console.log('کارت‌های نیت‌محور صفحه‌ی اول بدون عدد رندر می‌شوند.')
  }

  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
