import type { OwnerPlaceData } from './manage'
import { SITE_URL } from '@/routes'

type ExportPlace = Pick<OwnerPlaceData, 'slug' | 'name' | 'branchName' | 'sections'>

/** A portable, versioned snapshot; internal IDs, contacts and source metadata are intentionally omitted. */
export function buildMenuExport(place: ExportPlace, exportedAt: Date) {
  const siteOrigin = new URL(SITE_URL).origin
  const imageUrl = (path: string | null): string | null => {
    if (!path || !path.startsWith('/') || path.startsWith('//')) return null
    const url = new URL(path, siteOrigin)
    return url.origin === siteOrigin ? url.toString() : null
  }

  return {
    format: 'kucafe-menu',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    priceUnit: 'toman',
    place: {
      slug: place.slug,
      name: place.name,
      branchName: place.branchName,
    },
    sections: place.sections
      .filter(section => section.branchScope === 'branch' || section.branchScope === 'shared')
      .map(section => ({
        name: section.name,
        facetId: section.facetId,
        scope: section.branchScope,
        imageUrl: imageUrl(section.imageFullUrl),
        items: section.items.map(item => ({
          publicId: item.publicId,
          name: item.name,
          description: item.description,
          price: item.price,
          priceUnknown: item.priceUnknown,
          priceUpdatedAt: item.priceUpdatedAt?.toISOString() ?? null,
          available: item.available,
          featured: item.featured,
          archived: item.archivedAt !== null,
          excludeFromPriceStats: item.excludeFromPriceStats,
          imageUrl: imageUrl(item.imageUrl),
          variants: item.variants.map(variant => ({
            label: variant.label,
            price: variant.price,
            priceUpdatedAt: variant.priceUpdatedAt?.toISOString() ?? null,
            available: variant.available,
          })),
        })),
      })),
  } as const
}
