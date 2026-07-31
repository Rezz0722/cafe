import type { MetadataRoute } from 'next'
import { loadDistricts, loadPublishedViews } from '@/core/places/repository'
import { INTENT_ATTRIBUTES } from '@/core/taxonomy/attributes'
import { isIndexable } from '@/core/seo/indexability'
import { absoluteUrl, paths } from '@/routes'

/**
 * sitemap تولیدشده از دیتابیس.
 *
 * نکته‌ی مهم: همان قانون thin content که `robots` صفحات را تعیین می‌کند،
 * اینجا هم اعمال می‌شود. اگر صفحه‌ای `noindex` باشد ولی در sitemap بیاید،
 * سیگنال متناقضی به گوگل می‌دهیم — «ایندکسش نکن ولی حتماً ببینش».
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [places, districts] = await Promise.all([loadPublishedViews(), loadDistricts()])

  const entries: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl(paths.home),
      changeFrequency: 'daily',
      priority: 1,
    },
  ]

  // صفحات کافه — همیشه ایندکس‌پذیر
  for (const place of places) {
    entries.push({
      url: absoluteUrl(paths.cafe(place.slug)),
      lastModified: place.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  // صفحات محله
  for (const district of districts) {
    const count = places.filter((p) => p.districtId === district.id).length
    if (!isIndexable(count)) continue
    entries.push({
      url: absoluteUrl(paths.district(district.slug)),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  // صفحات تقاطع محله × نیت — فقط آن‌هایی که به حد نصاب رسیده‌اند
  for (const district of districts) {
    for (const attr of INTENT_ATTRIBUTES) {
      const count = places.filter(
        (p) => p.districtId === district.id && p.activeAttributeIds.includes(attr.id),
      ).length
      if (!isIndexable(count)) continue
      entries.push({
        url: absoluteUrl(paths.districtIntent(district.slug, attr.id)),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  }

  return entries
}
