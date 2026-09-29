import 'server-only'
import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { getDb,inDbTransaction,withDbTransaction } from '@/db/client'
import { auditLog, menuItem, menuItemVariant, menuSection } from '@/db/schema'
import { recordAudit, refreshPlaceDerived, type Actor } from './manage'

export type PriceSelection = { scope: 'all' | 'section' | 'items'; sectionId?: number; itemIds?: number[] }
export type PriceChange = { kind: 'item' | 'variant'; id: number; itemId: number; name: string; label: string | null; oldPrice: number; newPrice: number; oldUpdatedAt: string | null; oldItemUpdatedAt?: string | null }
export type PricePlan = { fingerprint: string; itemCount: number; variantCount: number; changes: PriceChange[]; percent: number }

export function adjustedPrice(price: number, percent: number): number {
  if (!Number.isFinite(percent) || percent === 0 || percent < -90 || percent > 200) throw new Error('درصد باید بین ۹۰- و ۲۰۰ باشد و صفر نباشد.')
  if (!Number.isSafeInteger(price) || price < 0) throw new Error('قیمت پایه معتبر نیست.')
  if (price === 0) return 0
  const result = Math.max(1000, Math.round(price * (1 + percent / 100) / 1000) * 1000)
  if (!Number.isSafeInteger(result) || result > 2147483647) throw new Error('قیمت جدید از محدوده قابل ذخیره بیشتر است.')
  return result
}

export function parsePriceSelection(scope: string, section: string, items: string): PriceSelection {
  if (scope === 'all') return { scope }
  if (scope === 'section') {
    const sectionId = Number(section)
    if (!Number.isSafeInteger(sectionId) || sectionId <= 0) throw new Error('دسته معتبر را انتخاب کنید.')
    return { scope, sectionId }
  }
  if (scope === 'items') {
    let itemIds: unknown
    try { itemIds = JSON.parse(items) } catch { throw new Error('انتخاب آیتم‌ها معتبر نیست.') }
    if (!Array.isArray(itemIds) || !itemIds.length || itemIds.length > 2000 || itemIds.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('حداقل یک آیتم معتبر انتخاب کنید.')
    return { scope, itemIds: [...new Set(itemIds)].sort((a, b) => a - b) }
  }
  throw new Error('محدوده تغییر قیمت معتبر نیست.')
}

export async function makePricePlan(placeId: number, percent: number, selection: PriceSelection): Promise<PricePlan> {
  if(!inDbTransaction())return withDbTransaction(()=>makePricePlan(placeId,percent,selection))
  adjustedPrice(100000, percent)
  const filters = [eq(menuItem.placeId, placeId), isNull(menuItem.archivedAt), inArray(menuSection.branchScope, ['shared', 'branch'])]
  if (selection.scope === 'section') filters.push(eq(menuItem.sectionId, selection.sectionId!))
  if (selection.scope === 'items') filters.push(inArray(menuItem.id, selection.itemIds!))
  const items = await getDb().select({ id: menuItem.id, name: menuItem.name, price: menuItem.price, updatedAt: menuItem.priceUpdatedAt }).from(menuItem)
    .innerJoin(menuSection, eq(menuSection.id, menuItem.sectionId)).where(and(...filters)).orderBy(asc(menuItem.id)).for('update')
  if (selection.scope === 'items' && items.length !== selection.itemIds!.length) throw new Error('بعضی آیتم‌ها متعلق به منوی فعال این شعبه نیستند؛ انتخاب را اصلاح کنید.')
  const ids = items.map(item => item.id)
  if (!ids.length) throw new Error('آیتمی در محدوده انتخاب‌شده نیست.')
  const variants = await getDb().select().from(menuItemVariant).where(inArray(menuItemVariant.itemId, ids)).orderBy(asc(menuItemVariant.id)).for('update')
  const byItem = new Map<number, typeof variants>()
  for (const variant of variants) byItem.set(variant.itemId, [...(byItem.get(variant.itemId) ?? []), variant])
  const changes: PriceChange[] = []
  for (const item of items) {
    const sizes = byItem.get(item.id) ?? []
    if (sizes.length) for (const size of sizes) {
      if (size.price === null || size.price <= 0) continue
      changes.push({ kind: 'variant', id: size.id, itemId: item.id, name: item.name, label: size.label, oldPrice: size.price, newPrice: adjustedPrice(size.price, percent), oldUpdatedAt: size.priceUpdatedAt?.toISOString() ?? null, oldItemUpdatedAt: item.updatedAt?.toISOString() ?? null })
    }
    else if (item.price !== null && item.price > 0) changes.push({ kind: 'item', id: item.id, itemId: item.id, name: item.name, label: null, oldPrice: item.price, newPrice: adjustedPrice(item.price, percent), oldUpdatedAt: item.updatedAt?.toISOString() ?? null })
  }
  const changed = changes.filter(change => change.oldPrice !== change.newPrice)
  if (!changed.length) throw new Error('قیمت قابل تغییری در محدوده انتخاب‌شده نیست.')
  return { percent, changes: changed, itemCount: new Set(changed.map(change => change.itemId)).size, variantCount: changed.filter(change => change.kind === 'variant').length, fingerprint: createHash('sha256').update(JSON.stringify({ placeId, percent, selection, changes: changed })).digest('hex') }
}

async function refreshVariantBases(placeId: number, ids: number[]) {
  if (!ids.length) return
  await getDb().execute(sql`UPDATE menu_item mi SET mi.price=(SELECT MIN(v.price) FROM menu_item_variant v WHERE v.item_id=mi.id AND v.available=1),mi.price_unknown=NOT EXISTS(SELECT 1 FROM menu_item_variant v WHERE v.item_id=mi.id AND v.available=1 AND v.price IS NOT NULL) WHERE mi.place_id=${placeId} AND mi.id IN (${sql.join(ids.map(id => sql`${id}`), sql`,`)})`)
}

export async function applyPricePlan(placeId: number, plan: PricePlan, fingerprint: string, actor: Actor):Promise<void> {
  if(!inDbTransaction())return withDbTransaction(()=>applyPricePlan(placeId,plan,fingerprint,actor))
  if (!fingerprint || fingerprint !== plan.fingerprint) throw new Error('قیمت یا انتخاب‌ها از زمان پیش‌نمایش تغییر کرده‌اند؛ پیش‌نمایش تازه بگیرید.')
  const updatedAt = new Date(Math.trunc(Date.now() / 1000) * 1000)
  for (const change of plan.changes) {
    if (change.kind === 'item') await getDb().update(menuItem).set({ price: change.newPrice, priceUpdatedAt: updatedAt }).where(and(eq(menuItem.id, change.id), eq(menuItem.placeId, placeId)))
    else await getDb().update(menuItemVariant).set({ price: change.newPrice, priceUpdatedAt: updatedAt }).where(and(eq(menuItemVariant.id, change.id), eq(menuItemVariant.itemId, change.itemId)))
  }
  await refreshVariantBases(placeId, [...new Set(plan.changes.filter(change => change.kind === 'variant').map(change => change.itemId))])
  for (const id of new Set(plan.changes.filter(change => change.kind === 'variant').map(change => change.itemId))) await getDb().update(menuItem).set({ priceUpdatedAt: updatedAt }).where(and(eq(menuItem.id, id), eq(menuItem.placeId, placeId)))
  await recordAudit(actor, 'menu.bulk_price', 'place', placeId, { changes: plan.changes, percent: plan.percent }, { fingerprint, updatedAt: updatedAt.toISOString(), itemCount: plan.itemCount, variantCount: plan.variantCount })
  await refreshPlaceDerived(placeId)
}

export async function restorePriceChange(placeId: number, auditId: number, actor: Actor):Promise<void> {
  if(!inDbTransaction())return withDbTransaction(()=>restorePriceChange(placeId,auditId,actor))
  const [entry] = await getDb().select().from(auditLog).where(and(eq(auditLog.id, auditId), eq(auditLog.entity, 'place'), eq(auditLog.entityId, String(placeId)), eq(auditLog.action, 'menu.bulk_price'))).limit(1).for('update')
  const before = entry?.before as { changes?: PriceChange[] } | null, after = entry?.after as { updatedAt?: string } | null
  if (!before?.changes?.length || !after?.updatedAt || before.changes.length > 10000) throw new Error('این تغییر snapshot قابل بازگردانی ندارد.')
  const [restored] = await getDb().select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.action, 'menu.bulk_price.restore'), eq(auditLog.entity, 'place'), eq(auditLog.entityId, String(placeId)), sql`JSON_EXTRACT(${auditLog.after},'$.auditId')=${auditId}`)).limit(1)
  if (restored) throw new Error('این تغییر قبلاً بازگردانی شده است.')
  for (const change of before.changes) {
    const [item] = await getDb().select({ id: menuItem.id, archivedAt: menuItem.archivedAt }).from(menuItem).where(and(eq(menuItem.id, change.itemId), eq(menuItem.placeId, placeId))).limit(1).for('update')
    if (!item || item.archivedAt) throw new Error('آیتمی حذف یا آرشیو شده است؛ بازگردانی خودکار امن نیست.')
    const table = change.kind === 'item' ? menuItem : menuItemVariant
    const ownership = change.kind === 'variant' ? and(eq(menuItemVariant.id, change.id), eq(menuItemVariant.itemId, change.itemId)) : and(eq(menuItem.id, change.id), eq(menuItem.placeId, placeId))
    const [current] = await getDb().select({ price: table.price, stamp: table.priceUpdatedAt }).from(table).where(ownership).limit(1).for('update')
    if (!current || current.price !== change.newPrice || current.stamp?.toISOString() !== after.updatedAt) throw new Error('قیمت‌ها پس از این عملیات دوباره تغییر کرده‌اند؛ برای جلوگیری از حذف تغییر جدید، بازگردانی متوقف شد.')
  }
  for (const change of before.changes) {
    const stamp = change.oldUpdatedAt ? new Date(change.oldUpdatedAt) : null
    if (change.kind === 'item') await getDb().update(menuItem).set({ price: change.oldPrice, priceUpdatedAt: stamp }).where(and(eq(menuItem.id, change.id), eq(menuItem.placeId, placeId)))
    else await getDb().update(menuItemVariant).set({ price: change.oldPrice, priceUpdatedAt: stamp }).where(and(eq(menuItemVariant.id, change.id), eq(menuItemVariant.itemId, change.itemId)))
  }
  await refreshVariantBases(placeId, [...new Set(before.changes.filter(change => change.kind === 'variant').map(change => change.itemId))])
  for (const id of new Set(before.changes.filter(change => change.kind === 'variant').map(change => change.itemId))) {
    const stamp = before.changes.find(change => change.itemId === id)?.oldItemUpdatedAt
    await getDb().update(menuItem).set({ priceUpdatedAt: stamp ? new Date(stamp) : null }).where(and(eq(menuItem.id, id), eq(menuItem.placeId, placeId)))
  }
  await recordAudit(actor, 'menu.bulk_price.restore', 'place', placeId, null, { auditId, itemCount: new Set(before.changes.map(change => change.itemId)).size })
  await refreshPlaceDerived(placeId)
}
