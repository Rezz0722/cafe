import 'server-only'

/**
 * اصلاحِ پیشنهادیِ کاربر روی اطلاعات یک مجموعه — بخش «مشارکت».
 *
 * ═══ مسئله ═══
 *
 * داده از منبعِ بیرونی آمده و بخشی از آن بیات یا غلط است: ساعت کاری عوض شده،
 * کافه جابه‌جا شده، قیمت‌ها بالا رفته. کافه‌دار پنل دارد ولی اکثر ۳۳۱ مجموعه
 * صاحبِ ثبت‌نام‌شده ندارند، و ادمین ۳۳۱ صفحه را دستی چک نمی‌کند. کسی که واقعاً
 * می‌داند، کاربری است که همین دیروز آنجا بوده.
 *
 * ═══ چرا پیشنهاد، نه ویرایش ═══
 *
 * نوشتنِ مستقیمِ کاربر روی `place` یعنی هر کسی می‌تواند اسم و آدرس و مختصات
 * ۳۳۱ مجموعه را عوض کند. پس پیشنهاد در `edit_suggestion` می‌نشیند و تا ادمین
 * تأییدش نکند، صفحه‌ی عمومی تغییری نمی‌بیند.
 *
 * ═══ چرا فقط کاربرِ وارد‌شده ═══
 *
 * صفِ بررسی بدون هویت، در چند روز پر از هرزنامه می‌شود و ارزشش صفر. با شماره‌ی
 * تأییدشده، هزینه‌ی هرزنامه بالا می‌رود و ادمین می‌تواند کاربرِ بدرفتار را
 * ببندد.
 */

import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { appUser, editSuggestion, place as placeTable } from '@/db/schema'
import {
  findSuggestableField,
  SUGGESTION_MAX_LENGTH,
  SUGGESTION_MIN_LENGTH,
} from './suggestFields'
import { cleanUserText } from '@/core/security/input'

/**
 * سقفِ پیشنهادِ در انتظارِ هر کاربر.
 *
 * کاربرِ خوش‌نیت هم‌زمان چند اصلاح دارد (ساعت + تلفن + قیمت)، پس سقف نباید یک
 * باشد. ولی کسی که ۵۰ پیشنهاد باز دارد، صف را قفل کرده و بررسی‌شان عملاً
 * انجام نمی‌شود.
 */
const MAX_PENDING_PER_USER = 12

/** سقفِ پیشنهادِ در انتظار برای یک مجموعه از یک کاربر. */
const MAX_PENDING_PER_PLACE = 4

export interface SubmitSuggestionInput {
  placeId: number
  userId: string
  field: string
  /** مقدار فعلیِ روی صفحه — برای اینکه ادمین بفهمد چه چیزی را عوض می‌کند. */
  currentValue: string | null
  suggestedValue: string
}

export type SubmitSuggestionResult =
  | { ok: true; id: number }
  | { ok: false; error: string }

export async function submitEditSuggestion(
  input: SubmitSuggestionInput,
): Promise<SubmitSuggestionResult> {
  const definition = findSuggestableField(input.field)
  if (!definition) return { ok: false, error: 'این فیلد قابل اصلاح نیست.' }

  const suggested = cleanUserText(input.suggestedValue, SUGGESTION_MAX_LENGTH + 1)
  if (suggested.length < SUGGESTION_MIN_LENGTH) {
    return { ok: false, error: 'توضیح کوتاه‌تر از آن است که قابل بررسی باشد.' }
  }
  if (suggested.length > SUGGESTION_MAX_LENGTH) {
    return { ok: false, error: `حداکثر ${SUGGESTION_MAX_LENGTH} نویسه.` }
  }

  const current = cleanUserText(input.currentValue, SUGGESTION_MAX_LENGTH)
  if (current && current === suggested) {
    return { ok: false, error: 'مقدار پیشنهادی با مقدار فعلی یکی است.' }
  }

  const db = getDb()

  // مجموعه باید وجود داشته باشد — `placeId` از فرم می‌آید و فرم قابل دست‌کاری
  // است. بدون این چک، خطای کلید خارجی به کاربر نشان داده می‌شود.
  const [target] = await db
    .select({ id: placeTable.id })
    .from(placeTable)
    .where(eq(placeTable.id, input.placeId))
    .limit(1)
  if (!target) return { ok: false, error: 'این مجموعه پیدا نشد.' }

  const [counts] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      forPlace: sql<number>`SUM(CASE WHEN ${editSuggestion.placeId} = ${input.placeId} THEN 1 ELSE 0 END)`,
      sameField: sql<number>`SUM(CASE WHEN ${editSuggestion.placeId} = ${input.placeId} AND ${editSuggestion.field} = ${input.field} THEN 1 ELSE 0 END)`,
    })
    .from(editSuggestion)
    .where(
      and(eq(editSuggestion.userId, input.userId), eq(editSuggestion.status, 'pending')),
    )

  if (Number(counts?.sameField ?? 0) > 0) {
    return {
      ok: false,
      error: `یک پیشنهاد برای «${definition.labelFa}» این مجموعه از شما در انتظار بررسی است.`,
    }
  }
  if (Number(counts?.forPlace ?? 0) >= MAX_PENDING_PER_PLACE) {
    return { ok: false, error: 'برای این مجموعه پیشنهادهای بررسی‌نشده دارید.' }
  }
  if (Number(counts?.total ?? 0) >= MAX_PENDING_PER_USER) {
    return {
      ok: false,
      error: 'پیشنهادهای بررسی‌نشده‌ی شما زیاد است. بگذارید اول این‌ها بررسی شوند.',
    }
  }

  const [inserted] = await db
    .insert(editSuggestion)
    .values({
      placeId: input.placeId,
      userId: input.userId,
      field: input.field,
      currentValue: current || null,
      suggestedValue: suggested,
    })
    .$returningId()

  return { ok: true, id: Number(inserted?.id ?? 0) }
}

// ═══════════════════════════════════════════════════════════════════════
// خواندن — پنل ادمین و پنل کاربر
// ═══════════════════════════════════════════════════════════════════════

export interface PendingSuggestion {
  id: number
  placeId: number
  placeName: string
  placeSlug: string
  field: string
  fieldLabel: string
  currentValue: string | null
  suggestedValue: string
  userName: string | null
  userPhone: string | null
  createdAt: Date
}

export async function listPendingSuggestions(limit = 40): Promise<PendingSuggestion[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: editSuggestion.id,
      placeId: editSuggestion.placeId,
      placeName: placeTable.name,
      placeSlug: placeTable.slug,
      field: editSuggestion.field,
      currentValue: editSuggestion.currentValue,
      suggestedValue: editSuggestion.suggestedValue,
      userName: appUser.name,
      userPhone: appUser.phone,
      createdAt: editSuggestion.createdAt,
    })
    .from(editSuggestion)
    .innerJoin(placeTable, eq(placeTable.id, editSuggestion.placeId))
    .leftJoin(appUser, eq(appUser.id, editSuggestion.userId))
    .where(eq(editSuggestion.status, 'pending'))
    .orderBy(desc(editSuggestion.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    ...row,
    fieldLabel: findSuggestableField(row.field)?.labelFa ?? row.field,
  }))
}

export async function countPendingSuggestions(): Promise<number> {
  const db = getDb()
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(editSuggestion)
    .where(eq(editSuggestion.status, 'pending'))
  return Number(row?.total ?? 0)
}

export interface MySuggestion {
  id: number
  placeName: string
  placeSlug: string
  fieldLabel: string
  suggestedValue: string
  status: string
  createdAt: Date
}

export async function listMySuggestions(userId: string, limit = 30): Promise<MySuggestion[]> {
  const db = getDb()
  const rows = await db
    .select({
      id: editSuggestion.id,
      placeName: placeTable.name,
      placeSlug: placeTable.slug,
      field: editSuggestion.field,
      suggestedValue: editSuggestion.suggestedValue,
      status: editSuggestion.status,
      createdAt: editSuggestion.createdAt,
    })
    .from(editSuggestion)
    .innerJoin(placeTable, eq(placeTable.id, editSuggestion.placeId))
    .where(eq(editSuggestion.userId, userId))
    .orderBy(desc(editSuggestion.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    placeName: row.placeName,
    placeSlug: row.placeSlug,
    fieldLabel: findSuggestableField(row.field)?.labelFa ?? row.field,
    suggestedValue: row.suggestedValue,
    status: row.status,
    createdAt: row.createdAt,
  }))
}

/**
 * بستنِ یک پیشنهاد.
 *
 * ═══ چرا «اعمال‌شده» خودش چیزی را عوض نمی‌کند ═══
 *
 * وسوسه‌ی نوشتنِ خودکارِ `suggestedValue` روی ستونِ مقصد هست، ولی متنِ کاربر
 * ساختار ندارد: «شنبه تا چهارشنبه ۹ تا ۲۳» باید به هفت ردیفِ `place_hour`
 * تبدیل شود، و «۳۶.۳۱۶، ۵۹.۵۶۷» باید اعتبارسنجی جغرافیایی شود. تحلیلِ حدسی
 * این متن‌ها یعنی داده‌ی خراب — که بدتر از داده‌ی بیات است.
 *
 * پس ادمین پیشنهاد را می‌خواند، خودش در پنل اعمال می‌کند، و بعد اینجا
 * «اعمال شد» می‌زند تا از صف برود.
 */
export async function reviewEditSuggestion(
  id: number,
  action: 'applied' | 'rejected',
  adminUserId: string,
): Promise<{ placeSlug: string | null }> {
  const db = getDb()

  const [row] = await db
    .select({ placeSlug: placeTable.slug })
    .from(editSuggestion)
    .innerJoin(placeTable, eq(placeTable.id, editSuggestion.placeId))
    .where(eq(editSuggestion.id, id))
    .limit(1)

  await db
    .update(editSuggestion)
    .set({ status: action, reviewedByUserId: adminUserId, reviewedAt: new Date() })
    .where(eq(editSuggestion.id, id))

  return { placeSlug: row?.placeSlug ?? null }
}
