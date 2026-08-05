/**
 * دود-تست لایه‌ی پرس‌وجو روی داده‌ی واقعیِ واردشده.
 *
 * هدف: ثابت‌کردن اینکه فیلتر و مرتب‌سازی و نگاشتِ خروجی روی ۳۳۱ مکان و
 * ۱۹٬۳۸۶ آیتم واقعاً کار می‌کنند — نه روی داده‌ی ساختگی.
 */
import {
  countPlaces,
  getPlaceDetail,
  getSiteStats,
  listDistricts,
  listPlaceCards,
} from '../src/core/places/queries'
import { closeDb } from '../src/db/connection'

async function main() {
  const stats = await getSiteStats()
  console.log('آمار سایت:', stats)

  const cards = await listPlaceCards({ limit: 3, sort: 'quality' })
  console.log(`\n${cards.length} کارت (سورت کیفیت):`)
  for (const card of cards) {
    console.log(
      `  ${card.name} · ${card.districtName ?? 'بی‌محله'} · رده ${card.priceTier} · کیفیت ${card.qualityScore} · لوگو ${card.logo ? 'دارد' : 'ندارد'}`,
    )
  }

  const cheap = await listPlaceCards({ limit: 3, sort: 'price_asc' })
  console.log('\nارزان‌ترین‌ها:')
  for (const card of cheap) {
    console.log(`  ${card.name} — میانه ${card.priceMedian?.toLocaleString('fa-IR')} تومان`)
  }

  const mappable = await countPlaces({ mappableOnly: true })
  console.log(`\nقابل نمایش روی نقشه: ${mappable}`)

  const districts = await listDistricts()
  const top = districts.filter((d) => d.placeCount > 0).sort((a, b) => b.placeCount - a.placeCount)
  console.log(`\n${top.length} محله دارای کافه. پرتعدادها:`)
  for (const d of top.slice(0, 6)) console.log(`  ${d.name}: ${d.placeCount}`)

  const slug = cards[0]!.slug
  const detail = await getPlaceDetail(slug)
  if (!detail) throw new Error(`جزئیات ${slug} پیدا نشد`)
  console.log(`\nجزئیات «${detail.name}»:`)
  console.log(`  دسته منو: ${detail.menu.length} · آیتم: ${detail.menuItemCount}`)
  console.log(`  تلفن: ${detail.phones.length} · شبکه: ${detail.socials.length} · شیفت ساعت: ${detail.hours.length}`)
  console.log(`  قیمت: ${detail.priceMin?.toLocaleString('fa-IR')} تا ${detail.priceMax?.toLocaleString('fa-IR')}`)
  const firstWithImage = detail.menu.flatMap((s) => s.items).find((i) => i.image)
  console.log(`  نمونه تصویر آیتم: ${firstWithImage?.image?.url ?? '—'} (${firstWithImage?.image?.width}×${firstWithImage?.image?.height})`)
  console.log(`  نسخه‌ی بزرگ: ${firstWithImage?.image?.fullUrl ?? '—'}`)

  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
