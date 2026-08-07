/**
 * تکمیلِ فقط-افزایشیِ منوها از داده‌ی تازه‌ی TopMenuMarket.
 *
 * ═══ چرا این جدا از `import:cafes` است ═══
 *
 * `import:cafes` همه‌ی `place` را پاک و از نو می‌نویسد — روی سایتِ زنده با
 * نظرها/امتیازها/audit_log واقعی وصل‌شده به `place.id`، این یعنی نابودیِ آن
 * داده‌ها. این اسکریپت هرگز چیزی را پاک نمی‌کند: فقط دسته/آیتمی که *نیست*
 * اضافه می‌کند، با تطبیق روی `place.source_id` (بدون تغییر id).
 *
 * ═══ چرا اصلاً چیزی کم بود ═══
 *
 * منبع اصلی درخت تو در تو دارد (دسته → زیردسته‌ها → آیتم)، ولی
 * `src/core/import/source.ts` فقط `آیتم‌ها`ی مستقیمِ هر دسته را می‌خواند و
 * `زیردسته‌ها` را نادیده می‌گیرد. هر جا سایت مبدا آیتم را زیرِ یک زیردسته
 * گذاشته باشد (نه مستقیم زیرِ دسته)، آن آیتم هیچ‌وقت وارد نشده. این اسکریپت
 * کل درخت (دسته + همه‌ی زیردسته‌های تودرتو) را یکی می‌کند و زیرِ همان دسته‌ی
 * سطح‌بالا اضافه می‌کند — بدون ساختن نام دسته‌ی جدید و عجیب.
 *
 *   npx tsx scripts/backfill-menus.ts --source /path/to/cafes_full_latest.json
 *   npx tsx scripts/backfill-menus.ts --source ... --dry-run   # فقط گزارش، بدون نوشتن
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, isNotNull, sql } from 'drizzle-orm'
import {
  cleanLine,
  detectPriceContext,
  normalizePrice,
  stripHtml,
  type PriceContext,
} from '../src/core/import/normalize'
import { rawItemDescription } from '../src/core/import/source'
import { hashUrl } from '../src/core/media/store'
import { normalizeFa } from '../src/core/text/normalize'
import { closeDb, getDb } from '../src/db/connection'
import { media as mediaTable, menuItem as menuItemTable, menuSection as menuSectionTable, place as placeTable } from '../src/db/schema'

// ── شکل خام منبع (نسخه‌ی عمیق، با زیردسته‌ها) ────────────────────────────

interface RawItemDeep {
  'شناسه'?: number | null
  'نام'?: string | null
  'نام انگلیسی'?: string | null
  'توضیحات'?: unknown
  'قیمت (تومان)'?: number | null
  'موجود است'?: boolean | null
  'ویژه است'?: boolean | null
  'تصویر'?: string | null
}

interface RawSectionDeep {
  'دسته‌بندی'?: string | null
  'توضیحات'?: string | null
  'تصویر'?: string | null
  'آیتم‌ها'?: RawItemDeep[] | null
  'زیردسته‌ها'?: RawSectionDeep[] | null
}

interface RawCafeDeep {
  'شناسه': number
  'نام مجموعه'?: string | null
  'منو'?: RawSectionDeep[] | null
}

/** دسته + همه‌ی زیردسته‌های تودرتو را یکی می‌کند — بدون از دست‌دادن هیچ آیتمی. */
function flattenItems(node: RawSectionDeep): RawItemDeep[] {
  const items = [...(node['آیتم‌ها'] ?? [])]
  for (const sub of node['زیردسته‌ها'] ?? []) {
    items.push(...flattenItems(sub))
  }
  return items
}

function allRawPrices(cafe: RawCafeDeep): number[] {
  const prices: number[] = []
  for (const section of cafe['منو'] ?? []) {
    for (const item of flattenItems(section)) {
      const p = item['قیمت (تومان)']
      if (typeof p === 'number' && p > 1) prices.push(p)
    }
  }
  return prices
}

async function main() {
  const args = process.argv.slice(2)
  const sourceIdx = args.indexOf('--source')
  if (sourceIdx === -1 || !args[sourceIdx + 1]) {
    console.error('استفاده: npx tsx scripts/backfill-menus.ts --source <path> [--dry-run]')
    process.exit(1)
  }
  const sourcePath = resolve(args[sourceIdx + 1]!)
  const dryRun = args.includes('--dry-run')

  const raw = readFileSync(sourcePath, 'utf8')
  const cafes = JSON.parse(raw) as RawCafeDeep[]
  console.log(`منبع: ${cafes.length} مجموعه از ${sourcePath}${dryRun ? ' (dry-run)' : ''}`)

  const db = getDb()

  // ── نقشه‌ی place: source_id → { id, priceUnitFixed }
  const places = await db
    .select({ id: placeTable.id, sourceId: placeTable.sourceId, name: placeTable.name, priceUnitFixed: placeTable.priceUnitFixed })
    .from(placeTable)
    .where(isNotNull(placeTable.sourceId))
  const placeBySourceId = new Map(places.map((p) => [p.sourceId!, p]))
  console.log(`${places.length} place با source_id در دیتابیس`)

  // ── ثبت آدرس تصویرِ آیتم‌های تازه (زیردسته‌ها) در جدول media
  //
  // `extractSourceImages` هم فقط آیتم‌های مستقیم را می‌بیند (همان محدودیتِ
  // ایمپورت اصلی)، پس تصویرِ آیتم‌های زیردسته هرگز ثبت نشده. بدون این، آن
  // آیتم‌ها با mediaId خالی درج می‌شوند و حتی بعد از media:download هم
  // بی‌عکس می‌مانند — چون media:download فقط ردیف‌های از قبل ثبت‌شده را
  // می‌گیرد، نه آدرس‌های تازه.
  const newImageUrls = new Set<string>()
  for (const cafe of cafes) {
    if (!placeBySourceId.has(cafe['شناسه'])) continue
    for (const section of cafe['منو'] ?? []) {
      for (const item of flattenItems(section)) {
        const url = item['تصویر']?.trim()
        if (url && /^https?:\/\//i.test(url)) newImageUrls.add(url)
      }
    }
  }
  if (newImageUrls.size > 0 && !dryRun) {
    const rows = [...newImageUrls].map((url) => ({
      urlHash: hashUrl(url),
      sourceUrl: url,
      kind: 'menu_item' as const,
      status: 'pending' as const,
    }))
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(mediaTable)
        .values(rows.slice(i, i + 500))
        .onDuplicateKeyUpdate({ set: { urlHash: sql`url_hash` } })
    }
    console.log(`${rows.length} آدرس تصویرِ آیتم زیردسته در media ثبت شد (وضعیت pending)`)
  } else if (newImageUrls.size > 0) {
    console.log(`${newImageUrls.size} آدرس تصویرِ آیتم زیردسته پیدا شد (dry-run — ثبت نمی‌شود)`)
  }

  // ── نقشه‌ی رسانه برای لینک‌کردن تصویر آیتم‌های جدید (بعد از ثبت‌های بالا)
  const mediaRows = await db.select({ id: mediaTable.id, urlHash: mediaTable.urlHash }).from(mediaTable)
  const mediaByHash = new Map(mediaRows.map((r) => [r.urlHash, r.id]))
  const mediaIdFor = (url: string | null | undefined): number | null => {
    const trimmed = url?.trim()
    if (!trimmed) return null
    return mediaByHash.get(hashUrl(trimmed)) ?? null
  }

  let placesTouched = 0
  let sectionsCreated = 0
  let itemsAdded = 0
  const skippedNoPlace: string[] = []
  const priceMismatch: string[] = []

  for (const cafe of cafes) {
    const place = placeBySourceId.get(cafe['شناسه'])
    if (!place) {
      skippedNoPlace.push(cleanLine(cafe['نام مجموعه']) || String(cafe['شناسه']))
      continue
    }
    const sections = cafe['منو'] ?? []
    if (sections.length === 0) continue

    // ── واحد قیمت همان‌طور که هنگام ایمپورت اصلی تشخیص داده می‌شد
    const priceContext: PriceContext = detectPriceContext(allRawPrices(cafe))
    if (priceContext.thousandUnit !== place.priceUnitFixed) {
      priceMismatch.push(
        `${place.name}: تشخیص تازه=${priceContext.thousandUnit} ولی place.price_unit_fixed=${place.priceUnitFixed}`,
      )
    }
    // منبع درست: پرچمِ از قبل ذخیره‌شده روی خودِ place — چون قیمت‌های
    // موجود با همان مقیاس نوشته شده‌اند و اگر اینجا چیز دیگری تشخیص بدهیم،
    // آیتم‌های جدید با مقیاسی متفاوت از بقیه‌ی منو ذخیره می‌شوند.
    const effectiveContext: PriceContext = { thousandUnit: place.priceUnitFixed, threshold: priceContext.threshold }

    // ── دسته‌های موجود این place
    const existingSections = await db
      .select({ id: menuSectionTable.id, name: menuSectionTable.name, sortOrder: menuSectionTable.sortOrder })
      .from(menuSectionTable)
      .where(eq(menuSectionTable.placeId, place.id))
    const sectionByName = new Map(existingSections.map((s) => [s.name, s]))
    let maxSectionSort = existingSections.reduce((m, s) => Math.max(m, s.sortOrder), -1)

    let placeChanged = false

    for (const [sectionIndex, section] of sections.entries()) {
      const sectionName = cleanLine(section['دسته‌بندی']) || 'سایر'
      const flatItems = flattenItems(section)
      if (flatItems.length === 0) continue

      let sectionId: number
      let existingItemSourceIds: Set<number>
      let existingItemNames: Set<string>
      let maxItemSort: number

      const existing = sectionByName.get(sectionName)
      if (existing) {
        sectionId = existing.id
        const existingItems = await db
          .select({ sourceId: menuItemTable.sourceId, name: menuItemTable.name, sortOrder: menuItemTable.sortOrder })
          .from(menuItemTable)
          .where(eq(menuItemTable.sectionId, sectionId))
        existingItemSourceIds = new Set(existingItems.map((i) => i.sourceId).filter((v): v is number => v != null))
        existingItemNames = new Set(existingItems.map((i) => i.name))
        maxItemSort = existingItems.reduce((m, i) => Math.max(m, i.sortOrder), -1)
      } else {
        maxSectionSort += 1
        if (!dryRun) {
          const [inserted] = await db
            .insert(menuSectionTable)
            .values({
              placeId: place.id,
              name: sectionName,
              description: stripHtml(section['توضیحات']) || null,
              mediaId: mediaIdFor(section['تصویر']),
              sortOrder: maxSectionSort,
            })
            .$returningId()
          sectionId = inserted!.id
        } else {
          sectionId = -1
        }
        sectionsCreated++
        placeChanged = true
        existingItemSourceIds = new Set()
        existingItemNames = new Set()
        maxItemSort = -1
      }

      const newItemRows: (typeof menuItemTable.$inferInsert)[] = []
      for (const item of flatItems) {
        const itemName = cleanLine(item['نام'])
        if (!itemName) continue
        const srcId = item['شناسه'] ?? null
        // دوباره‌کاری نکن: هم روی شناسه‌ی منبع (مطمئن‌تر) هم روی نام (پشتیبان
        // برای آیتم‌های قدیمی‌ای که شاید شناسه نداشتند) چک می‌کنیم.
        if (srcId != null && existingItemSourceIds.has(srcId)) continue
        if (existingItemNames.has(itemName)) continue

        const { price, priceUnknown } = normalizePrice(item['قیمت (تومان)'], effectiveContext)
        maxItemSort += 1
        newItemRows.push({
          placeId: place.id,
          sectionId,
          sourceId: srcId,
          name: itemName,
          nameEn: cleanLine(item['نام انگلیسی']) || null,
          nameNormalized: normalizeFa(itemName),
          description: stripHtml(rawItemDescription(item['توضیحات'] as never)) || null,
          price,
          priceUnknown,
          available: item['موجود است'] !== false,
          featured: item['ویژه است'] === true,
          mediaId: mediaIdFor(item['تصویر']),
          sortOrder: maxItemSort,
        })
        existingItemSourceIds.add(srcId ?? -1)
        existingItemNames.add(itemName)
      }

      if (newItemRows.length > 0) {
        if (!dryRun) await db.insert(menuItemTable).values(newItemRows)
        itemsAdded += newItemRows.length
        placeChanged = true
        console.log(`  + ${place.name} / ${sectionName}: ${newItemRows.length} آیتم جدید`)
      }
      void sectionIndex
    }

    if (placeChanged) placesTouched++
  }

  console.log('\n══ خلاصه ══')
  console.log(`place لمس‌شده: ${placesTouched}`)
  console.log(`دسته‌ی جدید: ${sectionsCreated}`)
  console.log(`آیتم جدید: ${itemsAdded}`)
  if (skippedNoPlace.length) {
    console.log(`\nدر منبع بود ولی در دیتابیس place با این source_id نیست (${skippedNoPlace.length}):`)
    for (const name of skippedNoPlace) console.log(`  - ${name}`)
  }
  if (priceMismatch.length) {
    console.log(`\nهشدار عدم تطابق واحد قیمت (${priceMismatch.length}) — از پرچم place استفاده شد:`)
    for (const msg of priceMismatch) console.log(`  - ${msg}`)
  }
  if (dryRun) console.log('\n(dry-run بود — چیزی نوشته نشد)')

  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
