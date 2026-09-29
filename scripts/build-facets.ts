/**
 * ساخت facetها، دیش‌ها و رول‌آپ‌هایشان از منوی واردشده.
 *
 *   npm run build:facets
 *
 * بعد از هر ایمپورت باید اجرا شود. idempotent است: جدول‌های مشتق را پاک و
 * از نو می‌سازد، ولی facet/dish را upsert می‌کند تا شناسه‌ها پایدار بمانند
 * (شناسه‌ی دیش در URL فیلترها می‌آید).
 *
 * ═══ چه چیزی محاسبه می‌شود ═══
 *
 *   menu_section.facet_id   دسته‌ی منو → facet کانونی
 *   menu_item.dish_id       آیتم منو → دیش کانونی
 *   place_facet             «این کافه ۱۲ آیتم پاستا دارد، از ۳۲۰ هزار»
 *   place_dish              «این کافه آلفردو دارد، ارزان‌ترینش این است»
 *   facet.place_count       برای نمایش «پاستا (۱۰۹)» روی نوار فیلتر
 *   dish.*                  آمار دیش برای رتبه‌بندی «بهترین X نزدیک من»
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq, inArray, sql } from 'drizzle-orm'
import {
  DISHES,
  FACETS,
  FACET_BY_ID,
  DISH_BY_SLUG,
  matchDish,
  matchFacet,
} from '../src/core/taxonomy/menuTaxonomy'
import { getDataPolicy } from '../src/core/settings/policies'
import { closeDb, getDb } from '../src/db/connection'
import {
  dish as dishTable,
  dishAlias as dishAliasTable,
  facet as facetTable,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  placeDish as placeDishTable,
  placeFacet as placeFacetTable,
} from '../src/db/schema'

const OUT_DIR = resolve(process.cwd(), 'task/05-facets')
const CHUNK = 500

/**
 * حداقل تعداد کافه برای اینکه یک دیش در «بهترین X نزدیک من» پیشنهاد شود.
 *
 * زیر این عدد، پیشنهاد بی‌فایده است: «بهترین سوشی نزدیک من» وقتی فقط ۳ کافه
 * سوشی دارند، عملاً همان ۳ کافه را نشان می‌دهد و کاربر حس می‌کند فیلتر
 * کار نمی‌کند.
 */
const POPULAR_DISH_MIN_PLACES_DEFAULT = 15

/** حداقل تعداد کافه برای اینکه facet روی نوار فیلترِ صفحه‌ی اول بیاید. */
const POPULAR_FACET_MIN_PLACES_DEFAULT = 30

/** پیش‌فرضِ نسبتِ تشخیص قیمتِ پرت — شرحش پایین‌تر، سر جای استفاده. */
const OUTLIER_RATIO_DEFAULT = 0.05

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]!
}

async function main() {
  const db = getDb()
  const started = Date.now()

  /*
    این سه عدد از تنظیمات پنل ادمین می‌آیند. اگر جدول `setting` ردیفی نداشته
    باشد، همان پیش‌فرض‌های بالا برمی‌گردند — پس این اسکریپت روی دیتابیس تازه
    هم کار می‌کند.
  */
  const policy = await getDataPolicy().catch(() => null)
  const POPULAR_FACET_MIN_PLACES =
    policy?.popularFacetMinPlaces ?? POPULAR_FACET_MIN_PLACES_DEFAULT
  const POPULAR_DISH_MIN_PLACES =
    policy?.popularDishMinPlaces ?? POPULAR_DISH_MIN_PLACES_DEFAULT
  const OUTLIER_RATIO = policy?.priceOutlierRatio ?? OUTLIER_RATIO_DEFAULT

  // ── ۱. واژگان
  console.log('نوشتن facetها…')
  for (const def of FACETS) {
    const values = {
      id: def.id,
      slug: def.id.replace(/_/g, '-'),
      labelFa: def.labelFa,
      labelEn: def.labelEn,
      kind: def.kind,
      isFilter: def.isFilter,
      sortOrder: def.sortOrder,
      icon: def.icon,
      hint: def.hint ?? null,
    }
    await db.insert(facetTable).values(values).onDuplicateKeyUpdate({
      set: {
        labelFa: values.labelFa,
        labelEn: values.labelEn,
        kind: values.kind,
        isFilter: values.isFilter,
        sortOrder: values.sortOrder,
        icon: values.icon,
        hint: values.hint,
      },
    })
  }

  console.log('نوشتن دیش‌ها…')
  for (const def of DISHES) {
    await db
      .insert(dishTable)
      .values({
        slug: def.slug,
        nameFa: def.nameFa,
        nameEn: def.nameEn ?? null,
        facetId: def.facetId,
        sortOrder: 0,
      })
      .onDuplicateKeyUpdate({
        set: { nameFa: def.nameFa, nameEn: def.nameEn ?? null, facetId: def.facetId },
      })
  }

  const dishRows = await db.select({ id: dishTable.id, slug: dishTable.slug }).from(dishTable)
  const dishIdBySlug = new Map(dishRows.map((row) => [row.slug, row.id]))

  // مترادف‌ها: پاک و از نو، چون فهرست در کد عوض می‌شود
  await db.delete(dishAliasTable)
  const aliasRows = DISHES.flatMap((def) => {
    const dishId = dishIdBySlug.get(def.slug)
    if (!dishId) return []
    // یکتاسازی: alias کلید اصلی است، پس تکراری بین دیش‌ها خطا می‌دهد.
    return def.aliases.map((alias) => ({ dishId, alias: alias.trim().toLowerCase() }))
  })
  const seenAlias = new Set<string>()
  const uniqueAliases = aliasRows.filter((row) => {
    if (seenAlias.has(row.alias)) return false
    seenAlias.add(row.alias)
    return true
  })
  for (let i = 0; i < uniqueAliases.length; i += CHUNK) {
    await db.insert(dishAliasTable).values(uniqueAliases.slice(i, i + CHUNK))
  }
  console.log(`  ${FACETS.length} facet · ${DISHES.length} دیش · ${uniqueAliases.length} مترادف`)

  // ── ۲. نگاشت دسته‌ها
  console.log('نگاشت دسته‌بندی‌های منو…')
  const sections = await db
    .select({
      id: menuSectionTable.id,
      placeId: menuSectionTable.placeId,
      name: menuSectionTable.name,
      branchScope: menuSectionTable.branchScope,
    })
    .from(menuSectionTable)

  // A provider page may contain headings for several physical branches. Those
  // rows stay in the database for audit/sync, but must never influence public
  // search facets, dish rankings or a branch's price statistics.
  const publicSectionIds = new Set(
    sections
      .filter((section) => section.branchScope === 'shared' || section.branchScope === 'branch')
      .map((section) => section.id),
  )

  const facetBySection = new Map<number, string>()
  const sectionNameById = new Map(sections.map((section) => [section.id, section.name]))
  const sectionIdsByFacet = new Map<string, number[]>()
  for (const section of sections) {
    const facetId = matchFacet(section.name)
    if (!facetId) continue
    facetBySection.set(section.id, facetId)
    const list = sectionIdsByFacet.get(facetId)
    if (list) list.push(section.id)
    else sectionIdsByFacet.set(facetId, [section.id])
  }

  // یک UPDATE به‌ازای هر facet (۳۴ تا) نه به‌ازای هر دسته (۳٬۶۰۱ تا).
  for (const [facetId, ids] of sectionIdsByFacet) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      await db
        .update(menuSectionTable)
        .set({ facetId })
        .where(inArray(menuSectionTable.id, ids.slice(i, i + CHUNK)))
    }
  }
  console.log(`  ${facetBySection.size}/${sections.length} دسته نگاشت شد`)

  // ── ۳. نگاشت آیتم‌ها
  console.log('نگاشت آیتم‌های منو…')
  const items = await db
    .select({
      id: menuItemTable.id,
      placeId: menuItemTable.placeId,
      sectionId: menuItemTable.sectionId,
      name: menuItemTable.name,
      price: menuItemTable.price,
    })
    .from(menuItemTable)

  const itemIdsByDish = new Map<string, number[]>()
  const dishByItem = new Map<number, string>()
  for (const item of items) {
    const facetId = facetBySection.get(item.sectionId) ?? null
    const slug = matchDish(item.name, facetId, {
      price: item.price,
      sectionName: sectionNameById.get(item.sectionId),
    })
    if (!slug) continue
    dishByItem.set(item.id, slug)
    const list = itemIdsByDish.get(slug)
    if (list) list.push(item.id)
    else itemIdsByDish.set(slug, [item.id])
  }

  for (const [slug, ids] of itemIdsByDish) {
    const dishId = dishIdBySlug.get(slug)
    if (!dishId) continue
    for (let i = 0; i < ids.length; i += CHUNK) {
      await db
        .update(menuItemTable)
        .set({ dishId })
        .where(inArray(menuItemTable.id, ids.slice(i, i + CHUNK)))
    }
  }
  console.log(`  ${dishByItem.size}/${items.length} آیتم نگاشت شد`)

  // ── ۴. رول‌آپ place_facet و place_dish
  console.log('محاسبه‌ی رول‌آپ‌ها…')
  interface Agg {
    count: number
    prices: number[]
    bestItemId: number | null
    bestPrice: number
  }
  const facetAgg = new Map<string, Agg>() // key: `${placeId}|${facetId}`
  const dishAgg = new Map<string, Agg>() // key: `${placeId}|${slug}`

  const touch = (map: Map<string, Agg>, key: string): Agg => {
    let agg = map.get(key)
    if (!agg) {
      agg = { count: 0, prices: [], bestItemId: null, bestPrice: Number.POSITIVE_INFINITY }
      map.set(key, agg)
    }
    return agg
  }

  /**
   * پاس اول: میانه‌ی قیمت هر دیش در کل شهر.
   *
   * لازم است چون اصلاح واحد قیمت در تسک ۰۴ در سطح *کافه* انجام می‌شود و
   * یک آیتمِ تکِ هزارتومانی در کافه‌ای با میانه‌ی سالم از تور رد می‌شود.
   * نتیجه‌اش را در داده دیدیم: «پپرونی تخمیری ۸۰۵» در حالی که میانه‌ی
   * پیتزا پپرونی شهر ۷۳۵٬۰۰۰ تومان است. آن ۸۰۵ اگر شمرده شود، همیشه
   * برنده‌ی «ارزان‌ترین پیتزای شهر» می‌شود.
   */
  const pricesByDish = new Map<string, number[]>()
  for (const item of items) {
    if (!publicSectionIds.has(item.sectionId)) continue
    const slug = dishByItem.get(item.id)
    if (!slug || item.price === null) continue
    const list = pricesByDish.get(slug)
    if (list) list.push(item.price)
    else pricesByDish.set(slug, [item.price])
  }
  const dishMedianPrice = new Map<string, number>()
  for (const [slug, prices] of pricesByDish) {
    const value = median(prices)
    if (value !== null) dishMedianPrice.set(slug, value)
  }

  /**
   * زیر این نسبت از میانه‌ی شهری، قیمت **داده‌ی خراب** است نه تخفیف.
   *
   * ۵٪ عمداً سخاوتمندانه است: یک لاته‌ی ۲۰ هزار تومانی در برابر میانه‌ی
   * ۲۴۴ هزار (۸٪) رد نمی‌شود — ممکن است واقعاً ارزان باشد. ولی ۸۰۵ تومان
   * در برابر ۷۳۵ هزار (۰٫۱٪) قطعاً غلط است.
   */
  const outliers: { itemId: number; slug: string; price: number; dishMedian: number }[] = []
  const isOutlier = (slug: string, price: number): boolean => {
    const dishMedian = dishMedianPrice.get(slug)
    if (!dishMedian) return false
    return price < dishMedian * OUTLIER_RATIO
  }

  for (const item of items) {
    if (!publicSectionIds.has(item.sectionId)) continue
    const facetId = facetBySection.get(item.sectionId)
    if (facetId) {
      const agg = touch(facetAgg, `${item.placeId}|${facetId}`)
      agg.count++
      if (item.price !== null) agg.prices.push(item.price)
    }
    const slug = dishByItem.get(item.id)
    if (slug) {
      const agg = touch(dishAgg, `${item.placeId}|${slug}`)
      agg.count++
      if (item.price !== null) {
        if (isOutlier(slug, item.price)) {
          outliers.push({
            itemId: item.id,
            slug,
            price: item.price,
            dishMedian: dishMedianPrice.get(slug)!,
          })
        } else {
          agg.prices.push(item.price)
          // «بهترین» = ارزان‌ترینِ قیمت‌دارِ غیرپرت. نماینده‌ی کارت.
          if (item.price < agg.bestPrice) {
            agg.bestPrice = item.price
            agg.bestItemId = item.id
          }
        }
      } else if (agg.bestItemId === null) {
        agg.bestItemId = item.id
      }
    }
  }
  console.log(`  ${outliers.length} قیمت پرت از رتبه‌بندی «ارزان‌ترین» کنار گذاشته شد`)

  await db.delete(placeFacetTable)
  await db.delete(placeDishTable)

  const facetRows = [...facetAgg].map(([key, agg]) => {
    const [placeId, facetId] = key.split('|')
    return {
      placeId: Number(placeId),
      facetId: facetId!,
      itemCount: agg.count,
      minPrice: agg.prices.length ? Math.min(...agg.prices) : null,
      medianPrice: median(agg.prices),
      confidence: 90,
    }
  })
  for (let i = 0; i < facetRows.length; i += CHUNK) {
    await db.insert(placeFacetTable).values(facetRows.slice(i, i + CHUNK))
  }

  const dishRowsToInsert = [...dishAgg].flatMap(([key, agg]) => {
    const [placeId, slug] = key.split('|')
    const dishId = dishIdBySlug.get(slug!)
    if (!dishId) return []
    return [
      {
        placeId: Number(placeId),
        dishId,
        itemCount: agg.count,
        minPrice: agg.prices.length ? Math.min(...agg.prices) : null,
        bestItemId: agg.bestItemId,
      },
    ]
  })
  for (let i = 0; i < dishRowsToInsert.length; i += CHUNK) {
    await db.insert(placeDishTable).values(dishRowsToInsert.slice(i, i + CHUNK))
  }
  console.log(`  ${facetRows.length} ردیف place_facet · ${dishRowsToInsert.length} ردیف place_dish`)

  // ── ۵. آمار روی واژگان + پرچم «پرمصرف»
  console.log('به‌روزرسانی آمار واژگان…')

  // فقط مکان‌های منتشرشده شمرده می‌شوند: شمارشی که فروشگاه‌های draft را هم
  // بشمارد، عددِ روی نوار فیلتر را با تعداد نتایج ناسازگار می‌کند.
  await db.execute(sql`
    UPDATE facet f
    SET place_count = (
      SELECT COUNT(DISTINCT pf.place_id)
      FROM place_facet pf
      JOIN place p ON p.id = pf.place_id
      WHERE pf.facet_id = f.id AND p.status = 'published'
    )
  `)
  await db.execute(sql`
    UPDATE dish d
    SET
      place_count = (
        SELECT COUNT(DISTINCT pd.place_id) FROM place_dish pd
        JOIN place p ON p.id = pd.place_id
        WHERE pd.dish_id = d.id AND p.status = 'published'
      ),
      item_count = (
        SELECT COALESCE(SUM(pd.item_count), 0) FROM place_dish pd
        JOIN place p ON p.id = pd.place_id
        WHERE pd.dish_id = d.id AND p.status = 'published'
      ),
      -- کمینه از place_dish خوانده می‌شود نه از menu_item: رول‌آپ قیمت‌های
      -- پرت را کنار گذاشته و همان عدد باید در کل سایت یکسان باشد.
      min_price = (
        SELECT MIN(pd.min_price) FROM place_dish pd
        JOIN place p ON p.id = pd.place_id
        WHERE pd.dish_id = d.id AND p.status = 'published'
      )
  `)
  // میانه در MySQL تابع آماده ندارد؛ با متغیر ردیف‌شمار حساب می‌شود.
  const dishMedians = await db.execute(sql`
    SELECT dish_id, CAST(AVG(price) AS SIGNED) AS median_price FROM (
      SELECT
        mi.dish_id,
        mi.price,
        ROW_NUMBER() OVER (PARTITION BY mi.dish_id ORDER BY mi.price) AS rn,
        COUNT(*) OVER (PARTITION BY mi.dish_id) AS cnt
      FROM menu_item mi
      JOIN menu_section ms ON ms.id = mi.section_id
      JOIN place p ON p.id = mi.place_id
      WHERE mi.dish_id IS NOT NULL
        AND mi.price IS NOT NULL
        AND ms.branch_scope IN ('shared', 'branch')
        AND p.status = 'published'
    ) ranked
    WHERE rn IN (FLOOR((cnt + 1) / 2), FLOOR((cnt + 2) / 2))
    GROUP BY dish_id
  `)
  const medianRows = dishMedians[0] as unknown as { dish_id: number; median_price: number }[]
  for (const row of medianRows) {
    await db
      .update(dishTable)
      .set({ medianPrice: row.median_price })
      .where(eq(dishTable.id, row.dish_id))
  }

  // پرچم پرمصرف — از عددِ واقعی، نه از سلیقه
  await db.execute(sql`
    UPDATE facet SET is_popular = (is_filter = 1 AND place_count >= ${POPULAR_FACET_MIN_PLACES})
  `)
  const popularSlugs = DISHES.filter((d) => d.popular).map((d) => d.slug)
  await db.execute(sql`UPDATE dish SET is_popular = 0`)
  if (popularSlugs.length > 0) {
    await db.execute(sql`
      UPDATE dish SET is_popular = 1
      WHERE slug IN ${popularSlugs} AND place_count >= ${POPULAR_DISH_MIN_PLACES}
    `)
  }

  // ── ۶. گزارش
  const facetStats = await db
    .select({
      id: facetTable.id,
      labelFa: facetTable.labelFa,
      kind: facetTable.kind,
      isFilter: facetTable.isFilter,
      isPopular: facetTable.isPopular,
      placeCount: facetTable.placeCount,
    })
    .from(facetTable)
    .orderBy(sql`place_count DESC`)

  const dishStats = await db
    .select({
      slug: dishTable.slug,
      nameFa: dishTable.nameFa,
      facetId: dishTable.facetId,
      isPopular: dishTable.isPopular,
      placeCount: dishTable.placeCount,
      itemCount: dishTable.itemCount,
      minPrice: dishTable.minPrice,
      medianPrice: dishTable.medianPrice,
    })
    .from(dishTable)
    .orderBy(sql`place_count DESC`)

  const lines: string[] = []
  const say = (s = '') => lines.push(s)
  const fa = (n: number | null) => (n === null ? '—' : n.toLocaleString('fa-IR'))

  say('# تسک ۰۵ — موتور facet و دیش ✅')
  say()
  say(`ساخته‌شده در ${((Date.now() - started) / 1000).toFixed(1)} ثانیه.`)
  say()
  say('## نتیجه')
  say()
  say('| سنجه | مقدار |')
  say('| --- | --- |')
  say(`| facet تعریف‌شده | ${FACETS.length} |`)
  say(`| دیش تعریف‌شده | ${DISHES.length} |`)
  say(`| مترادف دیش | ${uniqueAliases.length} |`)
  say(`| دسته‌ی نگاشت‌شده | ${facetBySection.size} از ${sections.length} |`)
  say(`| آیتم نگاشت‌شده به دیش | ${dishByItem.size} از ${items.length} |`)
  say(`| ردیف \`place_facet\` | ${facetRows.length} |`)
  say(`| ردیف \`place_dish\` | ${dishRowsToInsert.length} |`)
  say()
  say('## facetها')
  say()
  say('«پرمصرف» یعنی روی نوار فیلترِ صفحه‌ی اول می‌آید. شرطش عدد است نه سلیقه:')
  say(`فیلترپذیر بودن **و** حضور در حداقل ${POPULAR_FACET_MIN_PLACES} کافه‌ی منتشرشده.`)
  say()
  say('| facet | برچسب | نوع | کافه | فیلتر | پرمصرف |')
  say('| --- | --- | --- | --- | --- | --- |')
  for (const row of facetStats) {
    say(
      `| \`${row.id}\` | ${row.labelFa} | ${row.kind} | **${fa(row.placeCount)}** | ${row.isFilter ? '✓' : '—'} | ${row.isPopular ? '★' : '—'} |`,
    )
  }
  say()
  say('## دیش‌ها')
  say()
  say(`«پرمصرف» = علامت‌خورده در واژگان **و** حضور در حداقل ${POPULAR_DISH_MIN_PLACES} کافه.`)
  say('این‌ها همان‌هایی هستند که «بهترین X نزدیک من» برایشان ساخته می‌شود.')
  say()
  say('| دیش | facet | کافه | آیتم | کمینه قیمت | میانه | پرمصرف |')
  say('| --- | --- | --- | --- | --- | --- | --- |')
  for (const row of dishStats) {
    say(
      `| ${row.nameFa} (\`${row.slug}\`) | ${FACET_BY_ID.get(row.facetId ?? '')?.labelFa ?? '—'} | **${fa(row.placeCount)}** | ${fa(row.itemCount)} | ${fa(row.minPrice)} | ${fa(row.medianPrice)} | ${row.isPopular ? '★' : '—'} |`,
    )
  }
  say()
  say('## کاربردها')
  say()
  say('| خواسته‌ی کاربر | پرس‌وجو |')
  say('| --- | --- |')
  say('| «کافه‌های پاستادار» | `place_facet` روی `pasta` |')
  say('| «بهترین پاستا نزدیک من» | `place_dish` روی دیش `alfredo-pasta` + مرتب‌سازی فاصله |')
  say('| «ارزان‌ترین لاته شهر» | `place_dish.min_price` روی `latte` |')
  say('| «کافه‌ی رژیمی» | `place_facet` روی `healthy` |')
  say()
  say(`## قیمت‌های پرت — ${outliers.length} مورد`)
  say()
  say('اصلاح واحد قیمت در تسک ۰۴ در سطح **کافه** انجام می‌شود، پس یک آیتمِ')
  say('تکِ هزارتومانی در کافه‌ای با میانه‌ی سالم از تور رد می‌شود. نمونه‌ی')
  say('واقعی: «پپرونی تخمیری ۸۰۵» در حالی که میانه‌ی پیتزا پپرونی شهر')
  say('۷۳۵٬۰۰۰ تومان است. اگر شمرده شود، همیشه برنده‌ی «ارزان‌ترین پیتزای')
  say('شهر» می‌شود.')
  say()
  say('این قیمت‌ها **از منو حذف نشده‌اند** (همان چیزی نمایش داده می‌شود که در')
  say('منبع بود) ولی از رتبه‌بندی «ارزان‌ترین» کنار گذاشته شده‌اند. آستانه:')
  say(`کمتر از ${OUTLIER_RATIO * 100}٪ میانه‌ی شهریِ همان دیش.`)
  say()
  if (outliers.length > 0) {
    say('| دیش | قیمت ثبت‌شده | میانه‌ی شهری |')
    say('| --- | --- | --- |')
    for (const outlier of outliers.slice(0, 30)) {
      say(
        `| ${DISH_BY_SLUG.get(outlier.slug)?.nameFa ?? outlier.slug} | ${fa(outlier.price)} | ${fa(outlier.dishMedian)} |`,
      )
    }
    if (outliers.length > 30) say(`| … و ${outliers.length - 30} مورد دیگر | | |`)
  } else {
    say('_موردی نبود._')
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'REPORT.md'), `${lines.join('\n')}\n`, 'utf8')

  const popularFacets = facetStats.filter((f) => f.isPopular).length
  const popularDishes = dishStats.filter((d) => d.isPopular).length
  console.log(`\nfacet پرمصرف: ${popularFacets} · دیش پرمصرف: ${popularDishes}`)
  console.log('گزارش نوشته شد: task/05-facets/REPORT.md')
  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
