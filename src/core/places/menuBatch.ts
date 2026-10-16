import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, menuItem, menuSection, place, userPlaceRole } from '@/db/schema'
import { canWritePlace } from '@/core/auth/authorization'
import { samePlaceRevision } from './revision'
import { markManyItemFields } from './menuSourceOverrides'
import { recordAudit, refreshPlaceDerived, type Actor } from './manage'
import { MAX_MENU_BATCH_ITEMS, type MenuBatchOperation } from './menuBatchContract'

export type { MenuBatchOperation } from './menuBatchContract'
export interface MenuBatchInput { placeId: number; revision: string; itemIds: number[]; operation: MenuBatchOperation }
type BatchRow = { id: number; name: string; available: boolean; featured: boolean; archivedAt: Date | null; price: number | null; priceUpdatedAt: Date | null }
export interface MenuBatchPreview {
  token: string
  revision: string
  operation: MenuBatchOperation
  selectedCount: number
  changedCount: number
  unchangedCount: number
  rejectedCount: number
  examples: { name: string; before: string; after: string }[]
}

const OPERATIONS: MenuBatchOperation[] = ['available', 'unavailable', 'feature', 'unfeature', 'archive', 'restore']
const TEN_MINUTES = 10 * 60_000

function validate(input: MenuBatchInput) {
  if (!Number.isSafeInteger(input.placeId) || input.placeId <= 0 || !OPERATIONS.includes(input.operation)) throw new Error('عملیات یا شعبه معتبر نیست.')
  if (!Array.isArray(input.itemIds) || input.itemIds.length < 1 || input.itemIds.length > MAX_MENU_BATCH_ITEMS ||
    input.itemIds.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error(`در هر عملیات ۱ تا ${MAX_MENU_BATCH_ITEMS} آیتم یکتا انتخاب کنید.`)
  }
  if (!/^\d+$/.test(input.revision)) throw new Error('نسخه منو معتبر نیست.')
}

async function assertAccess(input: MenuBatchInput, actor: Actor, locked: boolean) {
  if (actor.onBehalfOf) throw new Error('در حالت مشاهده به‌عنوان، تغییر منو مجاز نیست.')
  const db = getDb()
  const accountQuery = db.select({ role: appUser.role, status: appUser.status, mustChangePassword: appUser.mustChangePassword }).from(appUser).where(eq(appUser.id, actor.userId)).limit(1)
  const [account] = await (locked ? accountQuery.for('update') : accountQuery)
  if (!account || account.status !== 'active' || account.mustChangePassword) throw new Error('حساب مجاز و فعال نیست.')
  const roleQuery = db.select({ role: userPlaceRole.role, status: userPlaceRole.status }).from(userPlaceRole)
    .where(and(eq(userPlaceRole.userId, actor.userId), eq(userPlaceRole.placeId, input.placeId))).limit(1)
  const [assignment] = await (locked ? roleQuery.for('update') : roleQuery)
  if (!canWritePlace(account.role, assignment?.status === 'active' ? assignment.role : null)) throw new Error('به این شعبه دسترسی ندارید.')
}

function valueFor(row: BatchRow, operation: MenuBatchOperation): boolean {
  switch (operation) {
    case 'available': return row.available
    case 'unavailable': return row.available
    case 'feature': return row.featured
    case 'unfeature': return row.featured
    case 'archive': return row.archivedAt !== null
    case 'restore': return row.archivedAt !== null
  }
}

function desired(operation: MenuBatchOperation): boolean {
  return operation === 'available' || operation === 'feature' || operation === 'archive'
}

function label(operation: MenuBatchOperation, value: boolean): string {
  if (operation === 'available' || operation === 'unavailable') return value ? 'موجود' : 'ناموجود'
  if (operation === 'feature' || operation === 'unfeature') return value ? 'ویژه' : 'عادی'
  return value ? 'آرشیوشده' : 'فعال'
}

function fingerprint(rows: BatchRow[]): string {
  return createHash('sha256').update(JSON.stringify(rows.map(row => [row.id, row.name, row.available, row.featured,
    row.archivedAt?.toISOString() ?? null, row.price, row.priceUpdatedAt?.toISOString() ?? null]))).digest('hex')
}

async function plan(input: MenuBatchInput, actor: Actor, locked: boolean) {
  validate(input)
  await assertAccess(input, actor, locked)
  const db = getDb()
  const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1)
  if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('منو تغییر کرده است؛ صفحه و پیش‌نمایش را تازه کنید.')
  const query = db.select({ id: menuItem.id, name: menuItem.name, available: menuItem.available, featured: menuItem.featured,
    archivedAt: menuItem.archivedAt, price: menuItem.price, priceUpdatedAt: menuItem.priceUpdatedAt })
    .from(menuItem).innerJoin(menuSection, eq(menuSection.id, menuItem.sectionId))
    .where(and(eq(menuItem.placeId, input.placeId), inArray(menuItem.id, input.itemIds),
      inArray(menuSection.branchScope, ['shared', 'branch']))).orderBy(menuItem.id)
  const rows = await (locked ? query.for('update') : query)
  const rejectedCount = input.itemIds.length - rows.length
  const changed = rows.filter(row => valueFor(row, input.operation) !== desired(input.operation))
  return {
    rows, changed, rejectedCount, digest: fingerprint(rows),
    preview: {
      revision: input.revision, operation: input.operation, selectedCount: input.itemIds.length,
      changedCount: changed.length, unchangedCount: rows.length - changed.length, rejectedCount,
      examples: changed.slice(0, 6).map(row => ({ name: row.name,
        before: label(input.operation, valueFor(row, input.operation)), after: label(input.operation, desired(input.operation)) })),
    },
  }
}

function signature(input: MenuBatchInput, actor: Actor, digest: string, expiry: number, secret: string): string {
  if (secret.length < 32) throw new Error('پیکربندی امن پیش‌نمایش موجود نیست.')
  return createHmac('sha256', secret).update(JSON.stringify({ placeId: input.placeId, revision: input.revision,
    operation: input.operation, itemIds: [...input.itemIds].sort((a, b) => a - b), userId: actor.userId, digest, expiry })).digest('hex')
}

export async function previewMenuBatch(input: MenuBatchInput, actor: Actor, secret: string, now = Date.now()): Promise<MenuBatchPreview> {
  const result = await plan(input, actor, false)
  const expiry = now + TEN_MINUTES
  return { ...result.preview, token: `${expiry}.${signature(input, actor, result.digest, expiry, secret)}` }
}

export async function applyMenuBatch(input: MenuBatchInput, actor: Actor, token: string, secret: string, now = Date.now()) {
  validate(input)
  return withDbTransaction(async () => {
    const db = getDb()
    const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1).for('update')
    if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('این پیش‌نمایش قبلاً اعمال شده یا منو تغییر کرده است؛ صفحه را تازه کنید.')
    const result = await plan(input, actor, true)
    const [time, hash, extra] = token.split('.')
    const expiry = Number(time)
    if (extra !== undefined || !/^\d+$/.test(time ?? '') || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + TEN_MINUTES || !/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('پیش‌نمایش معتبر نیست یا منقضی شده است.')
    const expected = signature(input, actor, result.digest, expiry, secret)
    if (!timingSafeEqual(Buffer.from(hash!), Buffer.from(expected))) throw new Error('آیتم‌ها پس از پیش‌نمایش تغییر کرده‌اند؛ دوباره بررسی کنید.')
    if (result.rejectedCount) throw new Error('بعضی آیتم‌ها متعلق به منوی قابل‌مدیریت این شعبه نیستند؛ انتخاب را اصلاح کنید.')
    if (!result.changed.length) throw new Error('هیچ تغییر تازه‌ای برای اعمال وجود ندارد.')
    const ids = result.changed.map(row => row.id)
    const where = and(eq(menuItem.placeId, input.placeId), inArray(menuItem.id, ids))
    const state = desired(input.operation)
    if (input.operation === 'available' || input.operation === 'unavailable') {
      await db.update(menuItem).set({ available: state }).where(where)
      await markManyItemFields(ids, ['available'], actor.userId, 'menu_batch')
    } else if (input.operation === 'feature' || input.operation === 'unfeature') {
      await db.update(menuItem).set({ featured: state }).where(where)
      await markManyItemFields(ids, ['featured'], actor.userId, 'menu_batch')
    } else {
      await db.update(menuItem).set({ archivedAt: state ? new Date() : null }).where(where)
      await markManyItemFields(ids, ['archivedAt'], actor.userId, 'menu_batch')
    }
    await recordAudit(actor, `menu.batch.${input.operation}`, 'place', input.placeId,
      { items: result.changed.map(row => ({ id: row.id, value: valueFor(row, input.operation) })) },
      { items: ids.map(id => ({ id, value: state })), revision: venue.revision + 1 })
    if (input.operation === 'archive' || input.operation === 'restore') await refreshPlaceDerived(input.placeId)
    await db.update(place).set({ revision: sql`${place.revision} + 1`, updatedAt: new Date() }).where(eq(place.id, input.placeId))
    return { changedCount: ids.length, revision: venue.revision + 1 }
  })
}
