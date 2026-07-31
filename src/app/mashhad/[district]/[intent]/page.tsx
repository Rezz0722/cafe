import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionPage } from '@/components/collection/CollectionPage'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import {
  loadDistrictBySlug,
  loadDistricts,
  loadPublishedViews,
} from '@/core/places/repository'
import {
  ATTRIBUTE_BY_ID,
  FILTER_ATTRIBUTES,
  INTENT_ATTRIBUTES,
} from '@/core/taxonomy/attributes'
import { robotsFor } from '@/core/seo/indexability'
import { paths } from '@/routes'

/**
 * صفحه‌ی تقاطع محله × نیت — «کافه مناسب کار با لپ‌تاپ در سجاد».
 *
 * پرارزش‌ترین نوع صفحه برای رشد ارگانیک. اما همین‌جاست که دام thin content
 * کمین کرده: صفحه ساخته می‌شود و برای کاربر کار می‌کند، ولی تا وقتی حداقل
 * ۵ کافه ندارد `noindex` می‌ماند و در sitemap نمی‌آید
 * (`src/core/seo/indexability.ts`).
 */

interface PageProps {
  params: Promise<{ district: string; intent: string }>
}

/**
 * فقط ترکیب‌های محله × نیت از پیش تولید می‌شوند، نه همه‌ی ویژگی‌ها. تولید
 * ۶×۱۶ صفحه در build، بیشترش خالی، ارزشی ندارد.
 */
export async function generateStaticParams() {
  const districts = await loadDistricts()
  return districts.flatMap((d) =>
    INTENT_ATTRIBUTES.map((attr) => ({ district: d.slug, intent: attr.id })),
  )
}

async function matchingPlaces(districtId: string, attributeId: string) {
  const all = await loadPublishedViews()
  return all.filter(
    (p) => p.districtId === districtId && p.activeAttributeIds.includes(attributeId),
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district: districtSlug, intent } = await params
  const district = await loadDistrictBySlug(districtSlug)
  const attr = ATTRIBUTE_BY_ID.get(intent)
  if (!district || !attr) return { title: 'پیدا نشد' }

  const places = await matchingPlaces(district.id, attr.id)
  const title = `کافه ${attr.labelFa} در ${district.name} مشهد`

  return {
    title,
    description: `${places.length > 0 ? `${places.length} ` : ''}کافه‌ی ${attr.labelFa} در محله‌ی ${district.name} مشهد. ساعت کاری، امکانات و نظرات واقعی کاربران.`,
    alternates: { canonical: paths.districtIntent(district.slug, attr.id) },
    // ← قانون thin content اینجا اعمال می‌شود
    robots: robotsFor(places.length),
    openGraph: { title, url: paths.districtIntent(district.slug, attr.id) },
  }
}

export default async function DistrictIntentPage({ params }: PageProps) {
  const { district: districtSlug, intent } = await params

  const district = await loadDistrictBySlug(districtSlug)
  const attr = ATTRIBUTE_BY_ID.get(intent)
  if (!district || !attr) notFound()

  const [places, districts] = await Promise.all([
    matchingPlaces(district.id, attr.id),
    loadDistricts(),
  ])

  // نیت‌های دیگر در همین محله + همین نیت در محله‌های دیگر.
  const related = [
    ...FILTER_ATTRIBUTES.filter((a) => a.id !== attr.id)
      .slice(0, 6)
      .map((a) => ({
        label: `${a.labelFa} در ${district.name}`,
        href: paths.districtIntent(district.slug, a.id),
      })),
    ...districts
      .filter((d) => d.id !== district.id)
      .map((d) => ({
        label: `${attr.labelFa} در ${d.name}`,
        href: paths.districtIntent(d.slug, attr.id),
      })),
  ]

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'کافه‌گرد', path: paths.home },
          { name: district.name, path: paths.district(district.slug) },
          { name: attr.labelFa, path: paths.districtIntent(district.slug, attr.id) },
        ]}
      />
      <CollectionPage
        title={`کافه ${attr.labelFa} در ${district.name}`}
        lede={
          attr.hint
            ? `${attr.hint} — کافه‌های محله‌ی ${district.name} مشهد که این ویژگی در آن‌ها بررسی و تأیید شده.`
            : `کافه‌های محله‌ی ${district.name} مشهد که برای «${attr.labelFa}» مناسب‌اند.`
        }
        crumbs={[
          { label: 'کافه‌گرد', href: paths.home },
          { label: district.name, href: paths.district(district.slug) },
          { label: attr.labelFa },
        ]}
        places={places}
        districts={districts}
        related={related}
        emptyNote={`هنوز کافه‌ای با ویژگی «${attr.labelFa}» در ${district.name} ثبت نشده.`}
      />
    </>
  )
}
