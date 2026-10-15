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

export type MenuExportData = ReturnType<typeof buildMenuExport>

// Excel treats these prefixes as formulas even after some leading whitespace or controls.
// A tab inside a quoted field forces Excel to display the value as text. We remove only
// the dangerous leading padding so the tab stays immediately before the formula marker.
const FORMULA_PREFIX = /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u
const LEADING_PADDING = /^[\p{White_Space}\p{Cc}\p{Cf}]*/u

export function escapeMenuCsvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value)
  const safe = FORMULA_PREFIX.test(raw) ? `\t${raw.replace(LEADING_PADDING, '')}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}

/** Excel-oriented CSV view of the same authorized snapshot as the JSON export. */
export function buildMenuCsv(data: MenuExportData): string {
  const headers = [
    'نام دسته', 'نام آیتم', 'توضیح', 'قیمت (تومان)', 'نام سایز',
    'قیمت سایز (تومان)', 'موجودی', 'وضعیت آرشیو', 'لینک تصویر',
  ]
  const rows: (string | number | null)[][] = [headers]
  const priceText = (price: number | null, unknown = false) => unknown || price === null ? 'نامعلوم' : price

  for (const section of data.sections) {
    for (const item of section.items) {
      const variants = item.variants.length ? item.variants : [null]
      for (const variant of variants) {
        rows.push([
          section.name,
          item.name,
          item.description,
          priceText(item.price, item.priceUnknown),
          variant?.label ?? '',
          variant ? priceText(variant.price) : '',
          item.available && (variant?.available ?? true) ? 'موجود' : 'ناموجود',
          item.archived ? 'آرشیو شده' : 'فعال',
          item.imageUrl,
        ])
      }
    }
  }

  return `\uFEFF${rows.map(row => row.map(escapeMenuCsvCell).join(',')).join('\r\n')}\r\n`
}
