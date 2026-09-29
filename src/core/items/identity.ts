import { normalizeFa } from '@/core/text/normalize'

/** slug فقط نمایشی است؛ sourceId هویت route را تعیین می‌کند. */
export function itemSlug(name: string): string {
  const slug = normalizeFa(name)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90)
  return slug || 'menu-item'
}

export function parseItemPublicId(value: string): string | null {
  const decoded = safeDecode(value)
  if (/^[1-9]\d{0,9}$/.test(decoded)) return decoded
  return /^(?:mi|imp|legacy)_[a-z0-9_-]{1,32}$/i.test(decoded) ? decoded : null
}

/** آیتم importشده با همان source id عمومی می‌شود؛ fallback نیز deterministic است. */
export function importedItemPublicId(
  sourceId: number | null | undefined,
  placeSourceId: number,
  sectionIndex: number,
  itemIndex: number,
): string {
  return sourceId ? String(sourceId) : `imp_${placeSourceId}_${sectionIndex}_${itemIndex}`.slice(0, 40)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
