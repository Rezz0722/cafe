import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { getDb, withDbTransaction } from '@/db/client'
import { appUser, menuItem, menuSection, place, userPlaceRole } from '@/db/schema'
import { createMenuItem, recordAudit, type Actor } from '@/core/places/manage'
import { samePlaceRevision } from '@/core/places/revision'
import { normalizeFa } from '@/core/text/normalize'
import { parseMenuCsv, selectMenuRows, type MenuImportPreview } from './menuCsv'

interface Input { placeId: number; sectionId: number; revision: string; text: string; delimiter: string }

async function plan(input: Input, actor: Actor, locked = false): Promise<Omit<MenuImportPreview, 'token'>> {
  if (actor.onBehalfOf) throw new Error('در حالت مشاهده به‌عنوان، ورود منو مجاز نیست.')
  const db = getDb()
  const accountQuery = db.select().from(appUser).where(eq(appUser.id, actor.userId)).limit(1)
  const [account] = await (locked ? accountQuery.for('update') : accountQuery)
  if (!account || account.status !== 'active' || account.mustChangePassword) throw new Error('حساب مجاز و فعال نیست.')
  const roleQuery = db.select().from(userPlaceRole).where(and(eq(userPlaceRole.userId, actor.userId), eq(userPlaceRole.placeId, input.placeId))).limit(1)
  const [role] = await (locked ? roleQuery.for('update') : roleQuery)
  if (account.role !== 'admin' && role?.status !== 'active') throw new Error('به این شعبه دسترسی ندارید.')
  const [venue] = await db.select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1)
  if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('اطلاعات شعبه تغییر کرده؛ صفحه و پیش‌نمایش را تازه کنید.')
  const [section] = await db.select().from(menuSection).where(and(eq(menuSection.id, input.sectionId), eq(menuSection.placeId, input.placeId))).limit(1)
  if (!section || !['shared', 'branch'].includes(section.branchScope)) throw new Error('دسته از منوی فعال همین شعبه انتخاب شود؛ داده قرنطینه وارد نمی‌شود.')
  const rows = parseMenuCsv(input.text, input.delimiter)
  // Archived records count too: import never resurrects or overwrites them.
  const existing = await db.select({ name: menuItem.name }).from(menuItem).where(and(eq(menuItem.placeId, input.placeId), eq(menuItem.sectionId, section.id)))
  const names = new Set(existing.map(row => normalizeFa(row.name)))
  return { rows: rows.map(row => ({ ...row, duplicate: names.has(normalizeFa(row.name)) })), revision: input.revision, sectionId: section.id, sectionName: section.name }
}

function signature(input: Input, userId: string, preview: Omit<MenuImportPreview, 'token'>, expiry: number, secret: string) {
  if (secret.length < 32) throw new Error('پیکربندی امن پیش‌نمایش موجود نیست.')
  return createHmac('sha256', secret).update(JSON.stringify({ input, userId, preview, expiry })).digest('hex')
}

export async function previewVenueMenuImport(input: Input, actor: Actor, secret: string, now = Date.now()): Promise<MenuImportPreview> {
  return withDbTransaction(async () => {
    const preview = await plan(input, actor), expiry = now + 10 * 60_000
    return { ...preview, token: `${expiry}.${signature(input, actor.userId, preview, expiry, secret)}` }
  })
}

export async function applyVenueMenuImport(input: Input, actor: Actor, token: string, selected: string, secret: string, now = Date.now()) {
  return withDbTransaction(async () => {
    // Same row lock and revision discipline as other venue menu writes.
    const [venue] = await getDb().select({ revision: place.revision }).from(place).where(eq(place.id, input.placeId)).limit(1).for('update')
    if (!venue || !samePlaceRevision(venue.revision, input.revision)) throw new Error('اطلاعات شعبه تغییر کرده یا ثبت قبلی انجام شده؛ صفحه و پیش‌نمایش را تازه کنید.')
    const preview = await plan(input, actor, true)
    const [timestamp, hash, extra] = token.split('.')
    const expiry = Number(timestamp)
    if (extra !== undefined || !/^\d+$/.test(timestamp ?? '') || !Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 10 * 60_000 || !/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('پیش‌نمایش معتبر نیست یا منقضی شده؛ دوباره پیش‌نمایش بگیرید.')
    const expected = signature(input, actor.userId, preview, expiry, secret)
    if (!timingSafeEqual(Buffer.from(hash!), Buffer.from(expected))) throw new Error('فایل، دسته یا وضعیت منو تغییر کرده؛ دوباره پیش‌نمایش بگیرید.')
    const rows = selectMenuRows(selected, preview.rows), ids: number[] = []
    for (const row of rows) {
      const result = await createMenuItem(input.placeId, { sectionId: input.sectionId, name: row.name, price: row.price, description: row.description }, actor)
      if (!result.ok || !result.itemId) throw new Error(result.error || 'افزودن آیتم انجام نشد.')
      ids.push(result.itemId)
    }
    await recordAudit(actor, 'menu.import.create', 'place', input.placeId, null, { sectionId: input.sectionId, itemIds: ids, count: ids.length })
    await getDb().update(place).set({ revision: sql`${place.revision} + 1`, updatedAt: new Date() }).where(eq(place.id, input.placeId))
    return { count: ids.length, itemIds: ids }
  })
}
