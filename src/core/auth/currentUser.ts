import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from './session'
import { findUserById } from '@/data/userStore'
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
 * هزینه‌اش یک خواندن فایل در هر درخواست است؛ در این مقیاس ناچیز.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null

  const user = await findUserById(payload.userId)
  if (!user || user.blocked) return null

  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role, // ← از store، نه از کوکی
    ownedPlaceSlugs: user.ownedPlaceSlugs,
  }
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
