import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CollectionPage } from '@/components/collection/CollectionPage'
import { BreadcrumbJsonLd } from '@/components/seo/PlaceJsonLd'
import {
  loadDistrictBySlug,
  loadDistricts,
  loadPublishedViews,
} from '@/core/places/repository'
import { INTENT_ATTRIBUTES } from '@/core/taxonomy/attributes'
import { robotsFor } from '@/core/seo/indexability'
import { paths } from '@/routes'

/**
 * صفحه‌ی محله — «کافه‌های سجاد».
 *
 * این‌ها به‌همراه صفحات محله × نیت، صفحات پول‌ساز محصول‌اند: جست‌وجوی محلی
 * واقعی دارند و گوگل‌مپ برایشان رتبه‌ی خوبی نمی‌گیرد.
 */

interface PageProps {
  params: Promise<{ district: string }>
}

export async function generateStaticParams() {
  const districts = await loadDistricts()
  return districts.map((d) => ({ district: d.slug }))
}

async function placesInDistrict(districtId: string) {
  const all = await loadPublishedViews()
  return all.filter((p) => p.districtId === districtId)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district: slug } = await params
  const district = await loadDistrictBySlug(slug)
  if (!district) return { title: 'پیدا نشد' }

  const places = await placesInDistrict(district.id)
  const title = `کافه‌های ${district.name} مشهد`

  return {
    title,
    description: `بهترین کافه‌ها و کافه‌رستوران‌های محله‌ی ${district.name} مشهد — با ساعت کاری، منو و امکانات واقعی مثل پریز، وای‌فای و فضای باز.`,
    alternates: { canonical: paths.district(district.slug) },
    robots: robotsFor(places.length),
    openGraph: { title, url: paths.district(district.slug) },
  }
}

export default async function DistrictPage({ params }: PageProps) {
  const { district: slug } = await params

  const district = await loadDistrictBySlug(slug)
  if (!district) notFound()

  const [places, districts] = await Promise.all([
    placesInDistrict(district.id),
    loadDistricts(),
  ])

  /**
   * لینک به همه‌ی نیت‌های همین محله. این پیوند داخلی همان چیزی است که به
   * گوگل کمک می‌کند صفحات تقاطع را پیدا کند — بدونش آن صفحات یتیم می‌مانند.
   */
  const related = INTENT_ATTRIBUTES.map((attr) => ({
    label: `${attr.labelFa} در ${district.name}`,
    href: paths.districtIntent(district.slug, attr.id),
  }))

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: 'کافه‌گرد', path: paths.home },
          { name: district.name, path: paths.district(district.slug) },
        ]}
      />
      <CollectionPage
        title={`کافه‌های ${district.name}`}
        lede={`همه‌ی کافه‌ها و کافه‌رستوران‌های محله‌ی ${district.name} مشهد، با ساعت کاری به‌روز و امکاناتی که واقعاً بررسی شده‌اند.`}
        crumbs={[
          { label: 'کافه‌گرد', href: paths.home },
          { label: district.name },
        ]}
        places={places}
        districts={districts}
        related={related}
        emptyNote={`هنوز کافه‌ای در ${district.name} ثبت نشده.`}
      />
    </>
  )
}
