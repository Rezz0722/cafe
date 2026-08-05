/**
 * دود-تستِ اتصال MySQL.
 *
 * سه چیز را ثابت می‌کند که هر سه‌شان قبلاً منبع باگ واقعی بوده‌اند:
 *
 *   ۱. فارسی و **ایموجی** سالم رفت‌وبرگشت می‌کنند (utf8mb4 واقعی، نه utf8
 *      سه‌بایتی). نام آیتم واقعی در داده‌ی منبع: «وسترن🌶️».
 *   ۲. `DECIMAL(10,7)` مختصات دقتش را از دست نمی‌دهد — با float هفتمین رقم
 *      اعشار می‌لنگد و آن حدود یک سانتی‌متر نیست، حدود ۱ متر است.
 *   ۳. جست‌وجوی FULLTEXT فارسی جواب می‌دهد.
 *
 *   npx tsx scripts/db-smoke.ts
 */

import { eq, sql } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection'
import { district, media, menuItem, menuSection, place } from '../src/db/schema'

const LAT = '36.3490596'
const LNG = '59.4297133'
const EMOJI_NAME = 'وسترن🌶️ تست'

async function main() {
  const db = getDb()
  let failures = 0
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures++
  }

  // پاک‌سازی اجرای قبلی
  await db.delete(place).where(eq(place.slug, '__smoke__'))
  await db.delete(district).where(eq(district.id, '__smoke__'))

  await db.insert(district).values({
    id: '__smoke__',
    slug: '__smoke__',
    name: 'محله‌ی آزمایشی',
    centerLat: LAT,
    centerLng: LNG,
  })

  await db.insert(place).values({
    slug: '__smoke__',
    name: 'کافه‌ی آزمایشی ☕',
    nameNormalized: 'کافه ازمایشی',
    kind: 'cafe',
    status: 'draft',
    lat: LAT,
    lng: LNG,
    geoStatus: 'ok',
    districtId: '__smoke__',
    address: 'مشهد، سجاد',
    about: 'متن فارسی با «گیومه» و نیم‌فاصله‌ی می‌آید',
  })

  const [row] = await db.select().from(place).where(eq(place.slug, '__smoke__'))
  check('درج و خواندن مکان', !!row)
  check('فارسی و ایموجی سالم', row?.name === 'کافه‌ی آزمایشی ☕', row?.name)
  check('نیم‌فاصله سالم', row?.about?.includes('می‌آید') === true)
  check('دقت DECIMAL مختصات', row?.lat === LAT && row?.lng === LNG, `${row?.lat}, ${row?.lng}`)

  const [sec] = await db
    .insert(menuSection)
    .values({ placeId: row!.id, name: 'صبحانه', sortOrder: 0 })
    .$returningId()

  await db.insert(menuItem).values([
    {
      placeId: row!.id,
      sectionId: sec!.id,
      name: EMOJI_NAME,
      nameNormalized: 'وسترن تست',
      price: 480_000,
    },
    {
      placeId: row!.id,
      sectionId: sec!.id,
      name: 'قیمت روز',
      nameNormalized: 'قیمت روز',
      price: null,
      priceUnknown: true,
    },
  ])

  const items = await db.select().from(menuItem).where(eq(menuItem.placeId, row!.id))
  check('ایموجی در نام آیتم', items.some((i) => i.name === EMOJI_NAME), items[0]?.name)
  check(
    'قیمت نامعلوم NULL می‌ماند (نه صفر)',
    items.some((i) => i.price === null && i.priceUnknown),
  )

  // FULLTEXT روی فارسی
  const ft = await db.execute(
    sql`SELECT id FROM menu_item WHERE MATCH(name, name_normalized) AGAINST (${'وسترن'} IN NATURAL LANGUAGE MODE)`,
  )
  const ftRows = ft[0] as unknown as unknown[]
  check('جست‌وجوی FULLTEXT فارسی', ftRows.length > 0, `${ftRows.length} نتیجه`)

  // media با URL بلند
  await db.insert(media).values({
    urlHash: 'a'.repeat(40),
    sourceUrl: `https://cdn.topmenumarket.com/storage/item/${'x'.repeat(600)}.webp`,
    kind: 'menu_item',
    status: 'pending',
  })
  const mediaRows = await db.select().from(media).where(eq(media.urlHash, 'a'.repeat(40)))
  check('URL بلند CDN (۷۰۰ کاراکتر) جا می‌شود', mediaRows.length === 1)

  // پاک‌سازی — cascade باید بخش و آیتم را هم ببرد
  await db.delete(place).where(eq(place.slug, '__smoke__'))
  await db.delete(district).where(eq(district.id, '__smoke__'))
  await db.delete(media).where(eq(media.urlHash, 'a'.repeat(40)))
  const leftovers = await db.select().from(menuItem).where(eq(menuItem.placeId, row!.id))
  check('حذف آبشاری منو با حذف مکان', leftovers.length === 0)

  await closeDb()
  console.log(failures === 0 ? '\nهمه‌ی بررسی‌ها موفق.' : `\n${failures} بررسی شکست خورد.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
