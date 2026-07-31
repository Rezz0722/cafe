'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/core/auth/currentUser'
import { isAdmin, ROLE_LABELS, type Role } from '@/core/auth/types'
import { slugExists } from '@/data/placeStore'
import {
  findUserById,
  grantPlaceOwnership,
  revokePlaceOwnership,
  setUserRole,
} from '@/data/userStore'
import { ROLE_OPTIONS } from './state'
import type { AdminActionState } from './state'
import { paths } from '@/routes'

/**
 * اکشن‌های مدیریت کاربر.
 *
 * هر سه کار (تغییر نقش، دادن و گرفتن مالکیت) در یک اکشن جمع شده‌اند چون هر
 * ردیف جدول یک فرم است و یک `useActionState`؛ سه اکشن جدا یعنی سه state در
 * هر ردیف و سه مسیر خطا برای همان یک پیام.
 *
 * تشخیص «کدام دکمه زده شد» از روی name/value خودِ دکمه است: مرورگر فقط
 * name/value دکمه‌ای که کلیک شده را می‌فرستد، پس دکمه‌ی «سلب» می‌تواند slug
 * خودش را با خودش بیاورد بدون اینکه هر slug یک فرم جدا لازم داشته باشد.
 */

function str(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v.trim() : ''
}

export async function updateUserAction(
  _prev: AdminActionState,
  form: FormData,
): Promise<AdminActionState> {
  /*
    اجازه دوباره سمت سرور بررسی می‌شود، نه فقط در صفحه.
    `requireAdmin` روی صفحه فقط رندر را می‌بندد؛ خودِ server action یک
    endpoint قابل صدا زدن است و هرکس می‌تواند مستقیم به آن POST کند.
  */
  const me = await getCurrentUser()
  if (!me || !isAdmin(me)) return { ok: false, error: 'دسترسی ندارید.' }

  const target = await findUserById(str(form, 'userId'))
  if (!target) return { ok: false, error: 'این کاربر دیگر وجود ندارد.' }

  // ── سلب مالکیت ──
  const revokeSlug = str(form, 'revoke')
  if (revokeSlug) {
    await revokePlaceOwnership(target.id, revokeSlug)
    revalidatePath(paths.admin)
    return { ok: true, message: `مالکیت «${revokeSlug}» گرفته شد.` }
  }

  const intent = str(form, 'intent')

  // ── اعطای مالکیت ──
  if (intent === 'grant') {
    const slug = str(form, 'slug')
    if (!slug) return { ok: false, error: 'slug کافه را وارد کنید.' }

    // slug غلط، مالکیتی می‌سازد که به هیچ کافه‌ای وصل نیست و بی‌صدا در پنل
    // مالک به «کافه‌ای پیدا نشد» تبدیل می‌شود. همین‌جا جلویش گرفته می‌شود.
    if (!(await slugExists(slug))) {
      return { ok: false, error: `کافه‌ای با slug «${slug}» در کاتالوگ نیست.` }
    }
    if (target.ownedPlaceSlugs.includes(slug)) {
      return { ok: false, error: 'این کافه از قبل به همین کاربر داده شده.' }
    }

    await grantPlaceOwnership(target.id, slug)
    revalidatePath(paths.admin)
    return { ok: true, message: `«${slug}» به ${target.name || target.phone} داده شد.` }
  }

  // ── تغییر نقش ──
  if (intent === 'role') {
    const role = str(form, 'role') as Role
    if (!ROLE_OPTIONS.includes(role)) return { ok: false, error: 'نقش نامعتبر است.' }
    if (role === target.role) return { ok: false, error: 'نقش تغییری نکرد.' }

    /*
      ادمین نمی‌تواند نقش خودش را پایین بیاورد.

      اگر تنها ادمینِ واردشده خودش را تنزل دهد، `/admin` برای همه بسته می‌شود
      و راه برگشتی از داخل محصول نمی‌ماند: باید یا `users.json` را روی سرور
      دستی ویرایش کرد یا شماره را به `ADMIN_PHONES` اضافه کرد و دوباره وارد
      شد. چون نمی‌شود مطمئن بود ادمین دومی هست که در را باز کند، ساده‌ترین
      قاعده‌ی امن این است: هیچ‌کس خودش را تنزل نمی‌دهد.
    */
    if (target.id === me.id) {
      return {
        ok: false,
        error: 'نقش خودتان را نمی‌توانید عوض کنید — با تنزل خودی، پنل برای همه بسته می‌شود.',
      }
    }

    await setUserRole(target.id, role)
    revalidatePath(paths.admin)
    return {
      ok: true,
      message: `${target.name || target.phone} حالا ${ROLE_LABELS[role]} است.`,
    }
  }

  return { ok: false, error: 'درخواست نامعتبر است.' }
}
