import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { VIEW_AS_COOKIE } from './impersonation'
import { SESSION_COOKIE } from './session'
import { resolveSessionTokens, type Session } from './sessionResolver'
import type { SessionUser } from './types'
import { authUrl } from '@/routes'

/**
 * کاربر فعلی — تنها منبع حقیقت برای «چه کسی وارد شده».
 *
 * ═══ چرا از دیتابیس می‌خوانیم و نه فقط از کوکی ═══
 *
 * کوکی امضاشده است، پس دستکاری‌ناپذیر — ولی **بیات** می‌شود. اگر ادمین
 * نقش کسی را عوض کند یا مسدودش کند، کوکیِ قدیمی هنوز نقش قبلی را دارد و
 * تا ۳۰ روز معتبر می‌ماند. خواندن کاربر از store یعنی تغییر نقش و مسدودی
 * بلافاصله اثر می‌کند.
 *
 * هزینه‌اش یک `SELECT` روی کلید اصلی در هر درخواست است؛ ناچیز.
 */

export type { Session } from './sessionResolver'

export async function getSession(): Promise<Session> {
  const store = await cookies()
  return resolveSessionTokens(store.get(SESSION_COOKIE)?.value, store.get(VIEW_AS_COOKIE)?.value)
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession()).user
}

/** ورود اجباری — به صفحه‌ی ورود هدایت می‌کند. */
export async function requireUser(redirectTo: string): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) redirect(authUrl(redirectTo))
  return user
}

/** فقط ادمین. */
export async function requireAdmin(redirectTo: string): Promise<SessionUser> {
  const user = await requireUser(redirectTo)
  if (user.role !== 'admin') redirect('/')
  return user
}

/** مالک یا ادمین. */
export async function requireOwner(redirectTo: string): Promise<SessionUser> {
  const user = await requireUser(redirectTo)
  if (user.role !== 'owner' && user.role !== 'admin') redirect('/profile')
  return user
}
