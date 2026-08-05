import 'server-only'

import { cookies } from 'next/headers'
import { SESSION_SECRET } from '@/core/config/env'
import { signClaims, verifyClaims, type TokenClaims } from './token'

/**
 * «مشاهده به‌عنوان» — ادمین پنل یک کاربر دیگر را همان‌طور که خودش می‌بیند باز
 * می‌کند.
 *
 * ═══ چرا کوکیِ دوم و نه عوض‌کردن کوکی نشست ═══
 *
 * اگر برای دیدن پنل یک مالک، نشست ادمین را با نشست او جایگزین کنیم، راه
 * برگشت می‌سوزد: ادمین از حساب خودش بیرون افتاده و باید دوباره وارد شود. با
 * کوکی دوم، نشست اصلی سر جایش می‌ماند و بیرون‌آمدن یعنی پاک‌کردن یک کوکی.
 *
 * ═══ چه چیزی جلوی سوءاستفاده را می‌گیرد ═══
 *
 *   • امضا با همان `SESSION_SECRET` — قابل جعل نیست.
 *   • `actorId` داخل امضا است و در هر درخواست با نشست فعلی مقایسه می‌شود؛
 *     پس کوکیِ کپی‌شده روی مرورگر شخص دیگر کار نمی‌کند.
 *   • نقش ادمینِ شروع‌کننده در هر درخواست از store خوانده می‌شود، نه از کوکی:
 *     ادمینِ تنزل‌یافته یا مسدودشده بلافاصله این دسترسی را از دست می‌دهد.
 *   • نیم‌ساعت اعتبار — پنجره‌ی یک کار پشتیبانی، نه یک نشست دوم.
 *   • ادمین دیگر را نمی‌شود مشاهده کرد (بررسی‌اش در `getSession` است): وگرنه
 *     می‌شد کارهای مدیریتی را زیر نام یک ادمین دیگر انجام داد.
 *
 * و مهم‌ترین بند: این حالت **فقط‌خواندنی** است. اکشن‌های نوشتن با دیدن
 * `actor` رد می‌شوند؛ پیام مشترکشان `VIEW_AS_READONLY` است.
 */

export const VIEW_AS_COOKIE = 'cafegard_view_as'

/** نیم ساعت. */
export const VIEW_AS_MAX_AGE_SEC = 30 * 60

export const VIEW_AS_READONLY =
  'در حالت «مشاهده به‌عنوان» هستید و این حالت فقط‌خواندنی است. اول از آن بیرون بیایید.'

export interface ViewAsClaims extends TokenClaims {
  /** کاربری که پنلش دیده می‌شود. */
  targetId: string
  /** ادمینی که شروعش کرده. */
  actorId: string
}

export function readViewAsClaims(raw: string | undefined): ViewAsClaims | null {
  const claims = verifyClaims<ViewAsClaims>(raw, SESSION_SECRET)
  if (!claims?.targetId || !claims.actorId) return null
  return claims
}

export async function startViewAs(actorId: string, targetId: string): Promise<void> {
  const token = signClaims<ViewAsClaims>(
    {
      actorId,
      targetId,
      exp: Math.floor(Date.now() / 1000) + VIEW_AS_MAX_AGE_SEC,
    },
    SESSION_SECRET,
  )

  const store = await cookies()
  store.set(VIEW_AS_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: VIEW_AS_MAX_AGE_SEC,
  })
}

export async function stopViewAs(): Promise<void> {
  const store = await cookies()
  store.delete(VIEW_AS_COOKIE)
}
