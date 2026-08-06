'use server'

/**
 * اکشن‌های پنل کافه‌دار.
 *
 * ═══ گاردِ مشترک: `requirePlaceAccess` ═══
 *
 * هر اکشن اول بررسی می‌کند که این کاربر **همین مکان** را اداره می‌کند. بدون
 * این بررسی، کافه‌داری که شناسه‌ی مکان را در فرم عوض کند می‌تواند منوی کافه‌ی
 * دیگری را ویرایش کند — و این نوع باگ در لاگ هم دیده نمی‌شود.
 *
 * ادمین به همه‌ی مکان‌ها دسترسی دارد، ولی در حالت «مشاهده به‌عنوان»
 * **هیچ نوشتنی** مجاز نیست.
 */

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { VIEW_AS_READONLY } from '@/core/auth/impersonation'
import { canManagePlace } from '@/core/auth/userRepo'
import {
  bulkAdjustPrices,
  replacePlaceHours,
  replyToReview,
  updateMenuItem,
  updatePlaceInfo,
  type Actor,
  type HourShiftInput,
} from '@/core/places/manage'
import { getModerationPolicy } from '@/core/settings/policies'
import { getDb } from '@/db/client'
import { menuItem as menuItemTable, place as placeTable, review as reviewTable } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { paths } from '@/routes'
import type { VenueActionState } from './state'

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function num(form: FormData, key: string): number | null {
  const raw = str(form, key).replace(/[٬,]/g, '')
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === 'true'
}

interface Access {
  ok: true
  placeId: number
  actor: Actor
}

async function requirePlaceAccess(
  placeId: number | null,
): Promise<Access | { ok: false; error: string }> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  if (!placeId) return { ok: false, error: 'مجموعه مشخص نیست.' }

  const allowed = user.role === 'admin' || (await canManagePlace(user.id, placeId))
  if (!allowed) return { ok: false, error: 'به این مجموعه دسترسی ندارید.' }

  return {
    ok: true,
    placeId,
    actor: { userId: user.id, label: user.name || user.phone || user.id },
  }
}

/** slug مکان — برای `revalidatePath` تا صفحه‌ی عمومی هم تازه شود. */
async function slugOf(placeId: number): Promise<string | null> {
  const db = getDb()
  const [row] = await db
    .select({ slug: placeTable.slug })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  return row?.slug ?? null
}

async function revalidateBoth(placeId: number): Promise<void> {
  const slug = await slugOf(placeId)
  if (slug) revalidatePath(paths.cafe(slug))
  revalidatePath(paths.ownerPanel)
}

// ═══════════════════════════════════════════════════════════════════════
// اطلاعات پایه
// ═══════════════════════════════════════════════════════════════════════

export async function saveVenueInfoAction(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }

  const result = await updatePlaceInfo(
    access.placeId,
    {
      name: str(form, 'name'),
      nameEn: str(form, 'nameEn') || null,
      about: str(form, 'about') || null,
      address: str(form, 'address'),
      instagram: str(form, 'instagram') || null,
      lat: num(form, 'lat'),
      lng: num(form, 'lng'),
      phonesRaw: str(form, 'phones'),
    },
    access.actor,
  )

  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'اطلاعات ذخیره شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ساعت کاری
// ═══════════════════════════════════════════════════════════════════════

export async function saveVenueHoursAction(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }

  /*
    فرم برای هر روز دو شیفت می‌فرستد: `open_0_0`, `close_0_0`, `open_0_1`, …
    شیفت خالی نادیده گرفته می‌شود، پس کافه‌داری که شیفت دوم ندارد چیزی
    نمی‌نویسد و همان یک شیفت ثبت می‌شود.
  */
  const shifts: HourShiftInput[] = []
  for (let dow = 0; dow < 7; dow++) {
    const closed = bool(form, `closed_${dow}`)
    if (closed) {
      shifts.push({ dow, shiftIndex: 0, opensAt: null, closesAt: null, closed: true })
      continue
    }
    for (let shiftIndex = 0; shiftIndex < 2; shiftIndex++) {
      const opensAt = str(form, `open_${dow}_${shiftIndex}`)
      const closesAt = str(form, `close_${dow}_${shiftIndex}`)
      if (!opensAt || !closesAt) continue
      shifts.push({ dow, shiftIndex, opensAt, closesAt, closed: false })
    }
  }

  const result = await replacePlaceHours(access.placeId, shifts, access.actor)
  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'ساعت کاری ذخیره شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// منو
// ═══════════════════════════════════════════════════════════════════════

export async function saveMenuItemAction(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const itemId = num(form, 'itemId')
  if (!itemId) return { ok: false, error: 'آیتم مشخص نیست.' }

  // مالکیتِ **آیتم** بررسی می‌شود، از طریق مکانی که آیتم به آن تعلق دارد —
  // نه از طریق `placeId` که در فرم آمده و قابل دستکاری است.
  const db = getDb()
  const [item] = await db
    .select({ placeId: menuItemTable.placeId })
    .from(menuItemTable)
    .where(eq(menuItemTable.id, itemId))
    .limit(1)
  if (!item) return { ok: false, error: 'این آیتم پیدا نشد.' }

  const access = await requirePlaceAccess(item.placeId)
  if (!access.ok) return { ok: false, error: access.error }

  const priceRaw = str(form, 'price')
  const result = await updateMenuItem(
    itemId,
    {
      // خالی‌گذاشتن قیمت یعنی «قیمت روز»، نه صفر.
      price: priceRaw === '' ? null : num(form, 'price'),
      available: bool(form, 'available'),
      featured: bool(form, 'featured'),
    },
    access.actor,
  )

  if (!result.ok) return { ok: false, error: result.error }
  await revalidateBoth(access.placeId)
  return { ok: true, message: 'آیتم ذخیره شد.' }
}

export async function bulkPriceAction(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const access = await requirePlaceAccess(num(form, 'placeId'))
  if (!access.ok) return { ok: false, error: access.error }

  const percent = num(form, 'percent')
  if (percent === null) return { ok: false, error: 'درصد تغییر را وارد کنید.' }

  const result = await bulkAdjustPrices(access.placeId, percent, access.actor)
  if (!result.ok) return { ok: false, error: result.error }

  await revalidateBoth(access.placeId)
  return {
    ok: true,
    message: `قیمت ${result.changed?.toLocaleString('fa-IR')} آیتم ${percent > 0 ? 'افزایش' : 'کاهش'} یافت و به هزار تومان گرد شد.`,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// پاسخ به نظر
// ═══════════════════════════════════════════════════════════════════════

export async function replyReviewAction(
  _prev: VenueActionState,
  form: FormData,
): Promise<VenueActionState> {
  const reviewId = num(form, 'reviewId')
  if (!reviewId) return { ok: false, error: 'نظر مشخص نیست.' }

  const db = getDb()
  const [review] = await db
    .select({ placeId: reviewTable.placeId })
    .from(reviewTable)
    .where(eq(reviewTable.id, reviewId))
    .limit(1)
  if (!review) return { ok: false, error: 'این نظر پیدا نشد.' }

  const access = await requirePlaceAccess(review.placeId)
  if (!access.ok) return { ok: false, error: access.error }

  const { ownerRepliesRequireApproval } = await getModerationPolicy()
  const result = await replyToReview(
    reviewId,
    str(form, 'text'),
    access.actor,
    ownerRepliesRequireApproval,
  )
  if (!result.ok) return { ok: false, error: result.error }

  await revalidateBoth(access.placeId)
  return { ok: true, message: 'پاسخ ثبت شد.' }
}
