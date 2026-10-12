import { getDb } from '@/db/connection'
import { menuItemFieldOverride, menuSectionFieldOverride } from '@/db/schema'
import type { ItemOverrideField, SectionOverrideField } from '@/core/sync/menuOverridePolicy'

export async function markItemFields(itemId: number, fields: readonly ItemOverrideField[], actorUserId: string, reason = 'venue_edit') {
  await markManyItemFields([itemId], fields, actorUserId, reason)
}

export async function markManyItemFields(itemIds: readonly number[], fields: readonly ItemOverrideField[], actorUserId: string, reason = 'venue_edit') {
  const ids = [...new Set(itemIds)]
  const names = [...new Set(fields)]
  if (!ids.length || !names.length) return
  for (let start = 0; start < ids.length; start += 200) {
    await getDb().insert(menuItemFieldOverride).values(ids.slice(start, start + 200).flatMap(itemId => names.map(fieldName => ({ itemId, fieldName, actorUserId, reason }))))
      .onDuplicateKeyUpdate({ set: { actorUserId, reason, updatedAt: new Date() } })
  }
}

export async function markSectionFields(sectionId: number, fields: readonly SectionOverrideField[], actorUserId: string, reason = 'venue_edit') {
  if (!fields.length) return
  const db = getDb()
  for (const fieldName of new Set(fields)) {
    await db.insert(menuSectionFieldOverride).values({ sectionId, fieldName, actorUserId, reason })
      .onDuplicateKeyUpdate({ set: { actorUserId, reason, updatedAt: new Date() } })
  }
}
