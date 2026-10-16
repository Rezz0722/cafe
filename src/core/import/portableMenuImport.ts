import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, menuItem, menuItemVariant, menuSection, place, userPlaceRole } from '@/db/schema'
import { canWritePlace } from '@/core/auth/authorization'
import { createMenuItem, createMenuSection, recordAudit, refreshPlaceDerived, type Actor } from '@/core/places/manage'
import { markItemFields, markSectionFields } from '@/core/places/menuSourceOverrides'
import { samePlaceRevision } from '@/core/places/revision'
import { normalizeFa } from '@/core/text/normalize'
import { MAX_PORTABLE_APPLY, parsePortableMenu, type PortableItem } from './menuPortable'

export interface PortableImportInput { placeId: number; revision: string; text: string }
export type PortableStatus = 'new' | 'existing' | 'conflict'
export interface PortableImportPreview {
  token: string; revision: string; format: 'json' | 'csv'; newSections: number; newItems: number; existingItems: number;
  conflicts: number; newVariants: number; archivedItems: number; unknownPrices: number; ignoredImages: number;
  ignoredMetadata: string[]; rows: { index: number; section: string; name: string; status: PortableStatus; reason?: string; variantCount: number }[]
}

async function assertAccess(input: PortableImportInput, actor: Actor, locked: boolean) {
  if (actor.onBehalfOf) throw new Error('در حالت مشاهده به‌عنوان، ورود منو مجاز نیست.')
  const db = getDb()
  const accountQuery = db.select({ role: appUser.role, status: appUser.status, mustChangePassword: appUser.mustChangePassword })
    .from(appUser).where(eq(appUser.id, actor.userId)).limit(1)
  const [account] = await (locked ? accountQuery.for('update') : accountQuery)
  if (!account || account.status !== 'active' || account.mustChangePassword) throw new Error('حساب مجاز و فعال نیست.')
  const roleQuery = db.select({ role: userPlaceRole.role, status: userPlaceRole.status }).from(userPlaceRole)
    .where(and(eq(userPlaceRole.userId, actor.userId), eq(userPlaceRole.placeId, input.placeId))).limit(1)
  const [assignment] = await (locked ? roleQuery.for('update') : roleQuery)
  if (!canWritePlace(account.role, assignment?.status === 'active' ? assignment.role : null)) throw new Error('به این شعبه دسترسی ندارید.')
}

async function plan(input: PortableImportInput, actor: Actor, locked: boolean) {
  if (!Number.isSafeInteger(input.placeId) || input.placeId <= 0 || !/^\d+$/.test(input.revision)) throw new Error('شعبه یا نسخه منو معتبر نیست.')
  await assertAccess(input, actor, locked)
  const db = getDb(), portable = parsePortableMenu(input.text)
  const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1)
  if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('منوی شعبه تغییر کرده؛ صفحه و پیش‌نمایش را تازه کنید.')
  const sectionQuery = db.select({ id: menuSection.id, name: menuSection.name, scope: menuSection.branchScope })
    .from(menuSection).where(eq(menuSection.placeId, input.placeId)).orderBy(menuSection.id)
  const existingSections = await (locked ? sectionQuery.for('update') : sectionQuery)
  const itemQuery = db.select({ id: menuItem.id, sectionId: menuItem.sectionId, publicId: menuItem.publicId,
    name: menuItem.name, price: menuItem.price, archivedAt: menuItem.archivedAt, available: menuItem.available })
    .from(menuItem).where(eq(menuItem.placeId, input.placeId)).orderBy(menuItem.id)
  const existingItems = await (locked ? itemQuery.for('update') : itemQuery)
  const sectionsByName = new Map<string, typeof existingSections>()
  for (const section of existingSections) {
    const key = normalizeFa(section.name)
    sectionsByName.set(key, [...(sectionsByName.get(key) ?? []), section])
  }
  const itemsByScopeName = new Map<string, typeof existingItems>()
  const byPublicId = new Map(existingItems.map(item => [item.publicId, item]))
  for (const item of existingItems) {
    const key = `${item.sectionId}\u0000${normalizeFa(item.name)}`
    itemsByScopeName.set(key, [...(itemsByScopeName.get(key) ?? []), item])
  }
  const rows = portable.items.map((item, index) => {
    const sections = sectionsByName.get(normalizeFa(item.section)) ?? []
    if (sections.length > 1) return { index, section: item.section, name: item.name, status: 'conflict' as const, reason: 'چند دسته هم‌نام در شعبه وجود دارد.', variantCount: item.variants.length }
    const section = sections[0]
    if (section && !['shared', 'branch'].includes(section.scope)) return { index, section: item.section, name: item.name, status: 'conflict' as const, reason: 'دستهٔ هم‌نام قرنطینه‌شده است.', variantCount: item.variants.length }
    const byId = item.publicId ? byPublicId.get(item.publicId) : null
    if (byId && (!section || byId.sectionId !== section.id || normalizeFa(byId.name) !== normalizeFa(item.name))) {
      return { index, section: item.section, name: item.name, status: 'conflict' as const, reason: 'شناسهٔ عمومی در این شعبه به آیتم دیگری تعلق دارد.', variantCount: item.variants.length }
    }
    const matches = section ? itemsByScopeName.get(`${section.id}\u0000${normalizeFa(item.name)}`) ?? [] : []
    if (matches.length > 1) return { index, section: item.section, name: item.name, status: 'conflict' as const, reason: 'چند آیتم هم‌نام در این دسته وجود دارد.', variantCount: item.variants.length }
    if (matches.length) return { index, section: item.section, name: item.name, status: 'existing' as const, reason: 'آیتم موجود، حتی اگر آرشیوی باشد، تغییر نمی‌کند.', variantCount: item.variants.length }
    return { index, section: item.section, name: item.name, status: 'new' as const, variantCount: item.variants.length }
  })
  const newItems = rows.filter(row => row.status === 'new')
  const snapshot = createHash('sha256').update(JSON.stringify({ sections: existingSections, items: existingItems, rows })).digest('hex')
  return {
    portable, rows, snapshot,
    preview: {
      revision: input.revision, format: portable.format,
      newSections: new Set(newItems.filter(row => !sectionsByName.has(normalizeFa(row.section))).map(row => normalizeFa(row.section))).size,
      newItems: newItems.length, existingItems: rows.filter(row => row.status === 'existing').length,
      conflicts: rows.filter(row => row.status === 'conflict').length,
      newVariants: newItems.reduce((sum, row) => sum + row.variantCount, 0),
      archivedItems: portable.items.filter(item => item.archived).length,
      unknownPrices: portable.items.filter(item => item.price === null).length,
      ignoredImages: portable.ignoredImageCount, ignoredMetadata: portable.ignoredMetadata, rows,
    },
  }
}

function signature(input: PortableImportInput, actor: Actor, snapshot: string, expiry: number, secret: string): string {
  if (secret.length < 32) throw new Error('پیکربندی امن پیش‌نمایش موجود نیست.')
  const fileHash = createHash('sha256').update(input.text).digest('hex')
  return createHmac('sha256', secret).update(JSON.stringify({ placeId: input.placeId, revision: input.revision,
    fileHash, snapshot, userId: actor.userId, expiry })).digest('hex')
}

export async function previewPortableImport(input: PortableImportInput, actor: Actor, secret: string, now = Date.now()): Promise<PortableImportPreview> {
  const result = await plan(input, actor, false), expiry = now + 10 * 60_000
  return { ...result.preview, token: `${expiry}.${signature(input, actor, result.snapshot, expiry, secret)}` }
}

function selectRows(raw: string, rows: Awaited<ReturnType<typeof plan>>['rows']) {
  let indices: unknown
  try { indices = JSON.parse(raw) } catch { throw new Error('انتخاب آیتم‌ها معتبر نیست.') }
  if (!Array.isArray(indices) || !indices.length || indices.length > MAX_PORTABLE_APPLY ||
    indices.some(index => !Number.isSafeInteger(index) || index < 0) || new Set(indices).size !== indices.length) {
    throw new Error(`در هر ثبت ۱ تا ${MAX_PORTABLE_APPLY} آیتم یکتا انتخاب کنید.`)
  }
  return indices.map(index => {
    const row = rows[index]
    if (!row || row.index !== index || row.status !== 'new') throw new Error('بعضی آیتم‌های انتخاب‌شده قابل افزودن نیستند؛ پیش‌نمایش را تازه کنید.')
    return row
  })
}

async function createPortableItem(placeId: number, sectionId: number, item: PortableItem, actor: Actor) {
  const db = getDb()
  const created = await createMenuItem(placeId, { sectionId, name: item.name, description: item.description,
    price: item.price, excludeFromPriceStats: item.excludeFromPriceStats }, actor)
  if (!created.ok || !created.itemId) throw new Error(created.error || 'ساخت آیتم انجام نشد.')
  const itemId = created.itemId
  if (item.variants.length) {
    await db.insert(menuItemVariant).values(item.variants.map((variant, index) => ({ itemId,
      label: variant.label, price: variant.price, available: variant.available, sortOrder: index, priceUpdatedAt: null })))
  }
  await db.update(menuItem).set({ available: item.available, featured: item.featured,
    archivedAt: item.archived ? new Date() : null, priceUpdatedAt: null }).where(and(eq(menuItem.id, itemId), eq(menuItem.placeId, placeId)))
  await markItemFields(itemId, ['name', 'description', 'price', 'available', 'featured', 'archivedAt'], actor.userId, 'roundtrip_import')
  return itemId
}

export async function applyPortableImport(input: PortableImportInput, actor: Actor, token: string, selected: string, secret: string, now = Date.now()) {
  return withDbTransaction(async () => {
    const db = getDb()
    const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1).for('update')
    if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('این فایل قبلاً اعمال شده یا منو تغییر کرده است؛ صفحه را تازه کنید.')
    const result = await plan(input, actor, true)
    const [time, hash, extra] = token.split('.'), expiry = Number(time)
    if (extra !== undefined || !/^\d+$/.test(time ?? '') || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 10 * 60_000 || !/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('پیش‌نمایش معتبر نیست یا منقضی شده است.')
    const expected = signature(input, actor, result.snapshot, expiry, secret)
    if (!timingSafeEqual(Buffer.from(hash!), Buffer.from(expected))) throw new Error('فایل یا منو پس از پیش‌نمایش تغییر کرده است.')
    const chosen = selectRows(selected, result.rows), sections = new Map<string, number>(), createdIds: number[] = []
    const existingSections = await db.select({ id: menuSection.id, name: menuSection.name, scope: menuSection.branchScope })
      .from(menuSection).where(eq(menuSection.placeId, input.placeId))
    for (const section of existingSections.filter(section => ['shared', 'branch'].includes(section.scope))) sections.set(normalizeFa(section.name), section.id)
    for (const row of chosen) {
      const item = result.portable.items[row.index]!, key = normalizeFa(item.section)
      let sectionId = sections.get(key)
      if (!sectionId) {
        const section = await createMenuSection(input.placeId, item.section, actor)
        if (!section.ok || !section.sectionId) throw new Error(section.error || 'ساخت دسته انجام نشد.')
        sectionId = section.sectionId
        await db.update(menuSection).set({ branchScope: 'branch' }).where(and(eq(menuSection.id, sectionId), eq(menuSection.placeId, input.placeId)))
        await markSectionFields(sectionId, ['name', 'branchScope'], actor.userId, 'roundtrip_import')
        sections.set(key, sectionId)
      }
      createdIds.push(await createPortableItem(input.placeId, sectionId, item, actor))
    }
    await refreshPlaceDerived(input.placeId)
    await recordAudit(actor, 'menu.import.portable', 'place', input.placeId, null,
      { format: result.portable.format, count: createdIds.length, ignoredImages: result.portable.ignoredImageCount,
        items: chosen.map((row, index) => ({ id: createdIds[index], section: row.section,
          name: row.name, price: result.portable.items[row.index]!.price,
          variants: result.portable.items[row.index]!.variants })) })
    await db.update(place).set({ revision: sql`${place.revision} + 1`, updatedAt: new Date() }).where(eq(place.id, input.placeId))
    return { count: createdIds.length, revision: venue.revision + 1, itemIds: createdIds }
  })
}
