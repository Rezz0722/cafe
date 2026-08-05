import type { MetadataRoute } from 'next'
import { listDistricts, listPublishedSlugs } from '@/core/places/queries'
import { absoluteUrl, paths } from '@/routes'

/**
 * sitemap تولیدشده از دیتابیس.
 *
 * ═══ قاعده‌ی سازگاری با robots ═══
 *
 * هر آدرسی که اینجا می‌آید **باید** ایندکس‌پذیر باشد. اگر صفحه‌ای `noindex`
 * باشد ولی در sitemap بیاید، سیگنال متناقضی به گوگل می‌دهیم: «ایندکسش نکن
 * ولی حتماً ببینش». به همین دلیل `/search` اینجا نیست — نه خودش و نه هیچ
 * ترکیب فیلتری از آن.
 *
 * صفحات کانونی سه‌تا هستند: خانه، محله، کافه.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, districts] = await Promise.all([listPublishedSlugs(), listDistricts()])

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(paths.home), changeFrequency: 'daily', priority: 1 },
  ]

  // محله‌ها — صفحات جمع‌کننده، بالاترین ارزش SEO بعد از خانه
  for (const district of districts) {
    // محله‌ی خالی نمی‌آید چون صفحه‌اش ۴۰۴ می‌دهد.
    if (district.placeCount === 0) continue
    entries.push({
      url: absoluteUrl(paths.district(district.slug)),
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  for (const place of slugs) {
    entries.push({
      url: absoluteUrl(paths.cafe(place.slug)),
      lastModified: place.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  return entries
}
