import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CafeDetail } from '@/components/cafe/CafeDetail'
import { BreadcrumbJsonLd, PlaceJsonLd } from '@/components/seo/PlaceJsonLd'
import {
  loadDistricts,
  loadPlaceView,
  loadPublishedViews,
} from '@/core/places/repository'
import { findSimilar } from '@/core/search/query'
import { PLACE_KIND_LABELS } from '@/types'
import { paths } from '@/routes'

/**
 * صفحه‌ی جزئیات کافه — مهم‌ترین صفحه‌ی سایت از نظر SEO.
 *
 * server component است، پس عنوان، توضیحات و JSON-LD همگی داخل HTML اولیه
 * می‌آیند. در نسخه‌ی SPA این صفحه همان `<title>` ثابت صفحه‌ی اصلی را داشت و
 * محتوایش فقط بعد از اجرای جاوااسکریپت ظاهر می‌شد.
 */

interface PageProps {
  params: Promise<{ slug: string }>
}

/** همه‌ی کافه‌ها در build تولید می‌شوند — سریع‌ترین حالت برای کرالر و کاربر. */
export async function generateStaticParams() {
  const places = await loadPublishedViews()
  return places.map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const place = await loadPlaceView(slug)
  if (!place) return { title: 'پیدا نشد' }

  const districts = await loadDistricts()
  const district = districts.find((d) => d.id === place.districtId)
  const kind = PLACE_KIND_LABELS[place.kind] ?? 'کافه'

  const title = `${place.name} — ${kind} در ${district?.name ?? 'مشهد'}`
  const description =
    place.description ??
    `${place.name}، ${kind} در ${district?.name ?? 'مشهد'}. ساعت کاری، منو، عکس‌ها و نظرات کاربران.`

  return {
    title,
    description,
    alternates: { canonical: paths.cafe(place.slug) },
    openGraph: {
      type: 'website',
      title,
      description,
      url: paths.cafe(place.slug),
      images: place.photos.length ? [{ url: place.photos[0].url }] : undefined,
    },
  }
}

export default async function CafePage({ params }: PageProps) {
  const { slug } = await params

  const [place, districts, all] = await Promise.all([
    loadPlaceView(slug),
    loadDistricts(),
    loadPublishedViews(),
  ])

  if (!place || place.status !== 'published') notFound()

  const district = districts.find((d) => d.id === place.districtId)
  const similar = findSimilar(place, all, 4)

  return (
    <>
      <PlaceJsonLd place={place} />
      <BreadcrumbJsonLd
        items={[
          { name: 'کافه‌گرد', path: paths.home },
          ...(district
            ? [{ name: district.name, path: paths.district(district.slug) }]
            : []),
          { name: place.name, path: paths.cafe(place.slug) },
        ]}
      />
      <CafeDetail
        place={place}
        districtName={district?.name ?? ''}
        districtSlug={district?.slug ?? ''}
        similar={similar.map((s) => ({
          slug: s.slug,
          name: s.name,
          rating: s.rawRating,
          districtName: districts.find((d) => d.id === s.districtId)?.name ?? '',
        }))}
      />
    </>
  )
}
