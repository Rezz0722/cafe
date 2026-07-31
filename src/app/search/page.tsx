import type { Metadata } from 'next'
import { SearchResults } from '@/components/search/SearchResults'
import { loadDistricts, loadPublishedViews } from '@/core/places/repository'
import { filtersFromQuery, searchPlaces } from '@/core/search/query'
import { parseSearchState } from '@/core/search/urlState'
import { MASHHAD_CENTER } from '@/core/geo/distance'

/**
 * صفحه‌ی نتایج — server component.
 *
 * جست‌وجو روی سرور اجرا می‌شود و نتیجه داخل HTML می‌آید. یعنی یک لینک
 * فیلترشده هم قابل اشتراک است، هم برای کرالر خواندنی.
 *
 * ولی ایندکس نمی‌شود: ترکیب‌های فیلتر بی‌نهایت‌اند و ایندکس‌شدنشان یعنی
 * هزاران صفحه‌ی تکراری و کم‌محتوا. صفحاتی که *باید* ایندکس شوند، صفحات
 * ساخت‌یافته‌ی `/mashhad/[district]/[intent]` هستند.
 */

export const metadata: Metadata = {
  title: 'جست‌وجوی کافه',
  robots: { index: false, follow: true },
}

const FALLBACK_COUNT = 3

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams
  const state = parseSearchState(params)

  const [places, districts] = await Promise.all([
    // مرکز شهر به‌عنوان مبدأ پیش‌فرض؛ موقعیت واقعی کاربر فقط سمت کلاینت
    // در دسترس است و فاز بعد اضافه می‌شود.
    loadPublishedViews({ userCoords: MASHHAD_CENTER }),
    loadDistricts(),
  ])

  // متن آزاد هم به نیت تبدیل می‌شود — «جایی دنج برای قرار توی احمدآباد»
  // باید همان چیزی را بدهد که chip زدن می‌دهد.
  const derived = state.query.trim() ? filtersFromQuery(state.query, districts) : null

  const effective = derived
    ? {
        ...state,
        // نیت‌های صریحِ URL بر استنتاج از متن اولویت دارند.
        attributeIds: state.attributeIds.length ? state.attributeIds : derived.attributeIds,
        districtId: state.districtId || derived.districtId,
        text: derived.text,
      }
    : state

  const scored = searchPlaces(places, effective)
  const results = scored.map((s) => s.place)

  const fallback = [...places]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, FALLBACK_COUNT)

  return (
    <SearchResults
      state={{ ...effective, view: state.view, query: state.query }}
      results={results}
      fallback={fallback}
      districts={districts}
    />
  )
}
