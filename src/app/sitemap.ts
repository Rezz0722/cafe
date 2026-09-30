import type { MetadataRoute } from 'next'
import {
  listDistricts,
  listFilterFacets,
  listSeoDishes,
  listPublishedSlugs,
  listPlaceCards,
} from '@/core/places/queries'
import { isIndexable } from '@/core/seo/indexability'
import { listExperienceSummaries } from '@/core/experience/queries'
import { absoluteUrl, paths } from '@/routes'

// Sitemap باید رشد و ویرایش داده را ببیند، نه فقط snapshot زمان build را.
export const revalidate = 3600

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
 * صفحات کانونی: خانه، محله، کافه و Dishهای محبوب با دادهٔ مقایسه‌ای کافی.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, districts, dishes, facets, reviewedCards, experiences] = await Promise.all([
    listPublishedSlugs(),
    listDistricts(),
    listSeoDishes(),
    listFilterFacets(),
    listPlaceCards({ bloggerReviewedOnly: true, limit: 1 }),
    listExperienceSummaries(),
  ])

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(paths.home), changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl(paths.districtHub), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl(paths.menuHub), changeFrequency: 'weekly', priority: 0.9 },
    { url: absoluteUrl(paths.experienceHub), changeFrequency: 'weekly', priority: 0.88 },
    { url: absoluteUrl(paths.about), changeFrequency: 'monthly', priority: 0.65 },
    { url: absoluteUrl(paths.methodology), changeFrequency: 'monthly', priority: 0.65 },
    { url: absoluteUrl(paths.editorialPolicy), changeFrequency: 'monthly', priority: 0.55 },
    { url: absoluteUrl(paths.privacy), changeFrequency: 'yearly', priority: 0.35 },
  ]

  if (reviewedCards.length > 0) {
    entries.push({ url: absoluteUrl(paths.reviewedCafes), changeFrequency: 'daily', priority: 0.75 })
  }

  for (const item of experiences) {
    if (!item.indexable) continue
    entries.push({
      url: absoluteUrl(paths.experience(item.experience.slug)),
      changeFrequency: 'weekly',
      priority: 0.79,
    })
  }

  // دسته‌های منو فقط وقتی صفحهٔ نتیجهٔ کافی دارند ایندکس می‌شوند؛ دسته‌های
  // خدماتی نیز عمداً از تجربهٔ جست‌وجوی خوراکی جدا نگه داشته می‌شوند.
  for (const facet of facets) {
    if (['addons', 'service'].includes(facet.id) || !isIndexable(facet.placeCount)) continue
    entries.push({
      url: absoluteUrl(paths.menuCategory(facet.id)),
      changeFrequency: 'weekly',
      priority: 0.78,
    })
  }

  // محله‌ها — صفحات جمع‌کننده، بالاترین ارزش SEO بعد از خانه
  for (const district of districts) {
    // محله‌ی خالی نمی‌آید چون صفحه‌اش ۴۰۴ می‌دهد.
    if (!isIndexable(district.placeCount)) continue
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

  // فقط Dishهای محبوب وارد sitemap می‌شوند؛ این‌ها در تعداد کافی کافه حاضرند
  // و صفحه‌شان واقعاً امکان مقایسه می‌دهد، برخلاف آیتم‌های کم‌داده و thin.
  for (const dish of dishes) {
    if (!isIndexable(dish.placeCount)) continue
    entries.push({
      url: absoluteUrl(paths.dish(dish.slug)),
      changeFrequency: 'weekly',
      priority: 0.75,
    })
  }

  return entries
}
