import type { Metadata } from 'next'
import { AdminPanel, type OwnerVenue } from '@/components/admin/AdminPanel'
import { requireOwner } from '@/core/auth/currentUser'
import { WEEKDAY_LABELS } from '@/core/hours/weekdays'
import { loadDistricts, loadPlaceView } from '@/core/places/repository'
import type { OpeningHour } from '@/core/places/types'
import type { AdminOpeningHour } from '@/data/adminSeed'
import { fa } from '@/lib/format'
import { paths } from '@/routes'

/**
 * پنل مالک کافه — خصوصی، پس از ایندکس بیرون است.
 *
 * قبلاً روی `/admin` بود و با یک redirect سمت کلاینت محافظت می‌شد. حالا
 * `/admin` پنل ادمین است و این صفحه با `requireOwner` روی سرور بسته می‌شود —
 * یعنی کاربر غیرمجاز اصلاً HTML پنل را نمی‌گیرد، نه اینکه بگیرد و بعد پرت شود.
 */
export const metadata: Metadata = {
  title: 'پنل کافه',
  robots: { index: false, follow: false },
}

/**
 * ساعت کاری دامنه → شکلی که ویرایشگر پنل می‌فهمد.
 *
 * همیشه هر هفت روز ساخته می‌شود، حتی روزهایی که رکورد ندارند: روزِ بدون
 * رکورد «تعطیل» است نه «غایب»، وگرنه مالک نمی‌تواند روزی را که هرگز ثبت
 * نشده باز کند. ساعت‌ها فارسی می‌شوند چون `TIME_OPTIONS` فارسی است و
 * `<select>` فقط با مقدار دقیقاً برابر، گزینه را انتخاب‌شده نشان می‌دهد.
 */
function toAdminHours(hours: OpeningHour[]): AdminOpeningHour[] {
  return WEEKDAY_LABELS.map((day, dow) => {
    const match = hours.find((h) => h.dow === dow)
    if (!match || match.closed) {
      return { day, from: '۰۹:۰۰', to: '۲۳:۰۰', closed: true, afterMidnight: false }
    }
    return {
      day,
      from: fa(match.opensAt),
      to: fa(match.closesAt),
      closed: false,
      afterMidnight: match.crossesMidnight,
    }
  })
}

export default async function VenuePanelPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const user = await requireOwner(`${paths.admin}/venue`)
  const { slug: requested } = await searchParams

  /*
    مالک فقط کافه‌ی خودش را می‌بیند و `?slug=` از او نادیده گرفته می‌شود —
    وگرنه هر مالکی با دست‌کاری آدرس، پنل کافه‌ی دیگری را باز می‌کرد.
    ادمین اجازه دارد، چون سؤال «مالک الان چه می‌بیند؟» بخشِ کارِ پشتیبانی است.

    فعلاً اولین کافه‌ی مالک. وقتی زنجیره‌ای‌ها آمدند، اینجا باید یک انتخابگر
    کافه بنشیند نه یک `[0]`.
  */
  const slug =
    (user.role === 'admin' && requested ? requested : null) ?? user.ownedPlaceSlugs[0] ?? null

  const [place, districts] = await Promise.all([
    slug ? loadPlaceView(slug) : null,
    loadDistricts(),
  ])

  // مالکیتی که به هیچ کافه‌ای نمی‌رسد (کافه حذف شده یا slug عوض شده) همان‌طور
  // رفتار می‌کند که «هنوز کافه‌ای ندارم» — کرش، جوابِ درستی برای مالک نیست.
  const venue: OwnerVenue | null = place
    ? {
        slug: place.slug,
        name: place.name,
        districtName: districts.find((d) => d.id === place.districtId)?.name ?? '',
        photo: place.photos[0]?.url,
        rating: place.rawRating,
        reviewCount: place.ratingCount,
        qualityScore: place.qualityScore,
        isOpenNow: place.isOpenNow,
        contact: {
          phone: place.phone ?? '',
          address: place.address,
          instagram: place.instagram ?? '',
        },
        hours: toAdminHours(place.hours),
      }
    : null

  return <AdminPanel venue={venue} />
}
