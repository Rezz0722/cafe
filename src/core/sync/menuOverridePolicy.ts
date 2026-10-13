export const ITEM_OVERRIDE_FIELDS = ['name', 'description', 'price', 'available', 'featured', 'mediaId', 'sectionId', 'sortOrder', 'archivedAt'] as const
export const SECTION_OVERRIDE_FIELDS = ['name', 'mediaId', 'sortOrder', 'branchScope'] as const
export type ItemOverrideField = typeof ITEM_OVERRIDE_FIELDS[number]
export type SectionOverrideField = typeof SECTION_OVERRIDE_FIELDS[number]

/** The unknown-price flag belongs to price; it must never diverge from it. */
export function mergeItemSource<T extends { name: string; price: number | null; priceUnknown: boolean }>(
  current: T,
  proposed: T,
  protectedFields: ReadonlySet<string>,
): T {
  const effective = { ...proposed }
  for (const field of ITEM_OVERRIDE_FIELDS) {
    if (!protectedFields.has(field)) continue
    if (field in current && field in effective) (effective as Record<string, unknown>)[field] = current[field as keyof T]
  }
  if (protectedFields.has('price')) effective.priceUnknown = current.priceUnknown
  return effective
}

export function sourceFieldConflicts(
  current: Record<string, unknown>,
  proposed: Record<string, unknown>,
  protectedFields: ReadonlySet<string>,
  entity: 'item' | 'section',
  entityId: number,
) {
  return [...protectedFields].filter(field => field in proposed && current[field] !== proposed[field])
    .map(field => ({ entity, entityId, field, current: current[field], source: proposed[field] }))
}
