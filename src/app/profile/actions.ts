'use server'

/**
 * اکشن‌های پنل کاربر.
 *
 * ═══ قاعده‌ی مشترک همه‌ی اکشن‌های این فایل ═══
 *
 * ۱. کاربر باید وارد شده باشد.
 * ۲. اگر ادمینی در حالت «مشاهده به‌عنوان» است، **هیچ نوشتنی مجاز نیست**.
 *    وگرنه تغییری به نام کاربر ثبت می‌شود که خودش نزده — و بعداً هیچ راهی
 *    برای تشخیصش نیست.
 */

import { revalidatePath } from 'next/cache'
import { getSession } from '@/core/auth/currentUser'
import { VIEW_AS_READONLY } from '@/core/auth/impersonation'
import { findUserById } from '@/core/auth/userRepo'
import { sanitizeAnswers } from '@/core/taste/quiz'
import {
  saveTasteProfile,
  submitPlace,
  submitReview,
  toggleSavedPlace,
} from '@/core/user/userData'
import { paths } from '@/routes'
import type { ActionState } from './state'

function str(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function num(form: FormData, key: string): number | null {
  const raw = str(form, key)
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** گارد مشترک — کاربر وارد و بدون حالت مشاهده. */
async function requireWritableUser(): Promise<
  { ok: true; userId: string; name: string } | { ok: false; error: string }
> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor) return { ok: false, error: VIEW_AS_READONLY }
  return { ok: true, userId: user.id, name: user.name }
}

// ═══════════════════════════════════════════════════════════════════════
// سلیقه‌سنجی
// ═══════════════════════════════════════════════════════════════════════

export async function saveTasteAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const guard = await requireWritableUser()
  if (!guard.ok) return { ok: false, error: guard.error }

  /*
    `getAll` لازم است نه `get`: سؤال‌های چندگزینه‌ای چند مقدار با یک نام
    می‌فرستند و `get` فقط اولی را برمی‌گرداند.
  */
  const raw: Record<string, string[]> = {}
  for (const key of new Set(form.keys())) {
    raw[key] = form.getAll(key).filter((value): value is string => typeof value === 'string')
  }

  const answers = sanitizeAnswers(raw)
  await saveTasteProfile(guard.userId, answers)

  revalidatePath(paths.profile)
  revalidatePath(paths.taste)
  return { ok: true, message: 'سلیقه‌ات ذخیره شد. پیشنهادها به‌روز شدند.' }
}

// ═══════════════════════════════════════════════════════════════════════
// ذخیره‌ی کافه
// ═══════════════════════════════════════════════════════════════════════

export async function toggleSaveAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const guard = await requireWritableUser()
  if (!guard.ok) return { ok: false, error: guard.error }

  const placeId = num(form, 'placeId')
  if (!placeId) return { ok: false, error: 'کافه مشخص نیست.' }

  const saved = await toggleSavedPlace(guard.userId, placeId)
  const slug = str(form, 'slug')
  if (slug) revalidatePath(paths.cafe(slug))
  revalidatePath(paths.profile)

  return { ok: true, message: saved ? 'به فهرست ذخیره‌ها اضافه شد.' : 'از ذخیره‌ها برداشته شد.' }
}

// ═══════════════════════════════════════════════════════════════════════
// نظر
// ═══════════════════════════════════════════════════════════════════════

export async function submitReviewAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const guard = await requireWritableUser()
  if (!guard.ok) return { ok: false, error: guard.error }

  const placeId = num(form, 'placeId')
  const stars = num(form, 'stars')
  if (!placeId) return { ok: false, error: 'کافه مشخص نیست.' }
  if (!stars) return { ok: false, error: 'امتیاز کلی را انتخاب کنید.' }

  // نامِ نمایشی در لحظه‌ی ثبت ذخیره می‌شود؛ اگر بعداً حساب حذف شود، نظر
  // بی‌نام نمی‌ماند.
  const account = await findUserById(guard.userId)
  const authorName = account?.name || 'کاربر کافه‌گرد'

  const result = await submitReview({
    placeId,
    userId: guard.userId,
    authorName,
    stars,
    text: str(form, 'text') || null,
    ratingCoffee: num(form, 'ratingCoffee'),
    ratingFood: num(form, 'ratingFood'),
    ratingVibe: num(form, 'ratingVibe'),
    ratingService: num(form, 'ratingService'),
    ratingValue: num(form, 'ratingValue'),
    visitDate: str(form, 'visitDate') || null,
  })

  if (!result.ok) return { ok: false, error: result.error }

  const slug = str(form, 'slug')
  if (slug) revalidatePath(paths.cafe(slug))
  revalidatePath(paths.myReviews)

  return {
    ok: true,
    message: 'نظرت ثبت شد و بعد از بررسی منتشر می‌شود.',
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ثبت کافه‌ی جدید
// ═══════════════════════════════════════════════════════════════════════

export async function submitPlaceAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const guard = await requireWritableUser()
  if (!guard.ok) return { ok: false, error: guard.error }

  const result = await submitPlace({
    userId: guard.userId,
    name: str(form, 'name'),
    address: str(form, 'address'),
    districtId: str(form, 'districtId') || null,
    phone: str(form, 'phone'),
    instagram: str(form, 'instagram'),
    lat: num(form, 'lat'),
    lng: num(form, 'lng'),
    kind: str(form, 'kind') || 'cafe',
    note: str(form, 'note'),
  })

  if (!result.ok) return { ok: false, error: result.error ?? 'ثبت نشد.' }

  revalidatePath(paths.submitPlace)
  return {
    ok: true,
    message: 'ممنون! کافه در صف بررسی است و بعد از تأیید منتشر می‌شود.',
  }
}
