import 'server-only'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readViewAsClaims, VIEW_AS_COOKIE } from './impersonation'
import { SESSION_COOKIE, verifySessionToken } from './session'
import { findUserById } from './userRepo'
import type { AppUser, SessionUser } from './types'
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

/** نشستِ حل‌شده — با در نظر گرفتن «مشاهده به‌عنوان». */
export interface Session {
  /** کسی که صفحات، او را می‌بینند. */
  user: SessionUser | null
  /**
   * ادمینِ واقعی — فقط وقتی «مشاهده به‌عنوان» روشن است، وگرنه `null`.
   * وجودش یعنی «این نشست عاریتی است»، و همین پرچمِ فقط‌خواندنی‌بودن است.
   */
  actor: SessionUser | null
}

const NO_SESSION: Session = { user: null, actor: null }

function toSessionUser(user: AppUser): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    role: user.role, // ← از store، نه از کوکی
    ownedPlaceSlugs: user.ownedPlaceSlugs,
  }
}

export async function getSession(): Promise<Session> {
  const store = await cookies()
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!payload) return NO_SESSION

  const account = await findUserById(payload.userId)
  if (!account || account.blocked) return NO_SESSION

  const self = toSessionUser(account)

  const claims = readViewAsClaims(store.get(VIEW_AS_COOKIE)?.value)
  /*
    سه شرط، هر سه لازم: کوکی معتبر باشد، صاحب نشست همین حالا ادمین باشد، و
    کوکی به نام همین شخص صادر شده باشد. شرط سوم است که کوکیِ کپی‌شده روی
    مرورگر دیگری را بی‌اثر می‌کند.

    کوکیِ بیات را همین‌جا پاک نمی‌کنیم: نوشتن کوکی در جریان رندرِ یک صفحه در
    App Router خطا می‌دهد. خودش نیم‌ساعته منقضی می‌شود و تا آن موقع فقط
    نادیده گرفته می‌شود.
  */
  if (!claims || self.role !== 'admin' || claims.actorId !== self.id) {
    return { user: self, actor: null }
  }

  const target = await findUserById(claims.targetId)
  // ادمین دیگر، حساب مسدود و کاربر حذف‌شده: هیچ‌کدام قابل مشاهده نیستند.
  if (!target || target.blocked || target.role === 'admin') {
    return { user: self, actor: null }
  }

  return { user: toSessionUser(target), actor: self }
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
