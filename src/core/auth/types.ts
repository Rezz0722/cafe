/**
 * نقش‌ها.
 *
 * سه نقش، نه بیشتر. RBAC پیچیده در این مقیاس فقط هزینه است (بخش ۸ سند
 * معماری). اگر روزی لازم شد، اضافه‌کردن نقش ساده است؛ برداشتن یک سیستم
 * مجوز over-engineered سخت است.
 */
export type Role = 'customer' | 'owner' | 'admin'

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'کاربر',
  owner: 'مالک کافه',
  admin: 'مدیر',
}

export interface AppUser {
  id: string
  /** شکل کانونی 09xxxxxxxxx — کلید یکتای کاربر. */
  phone: string
  name: string
  role: Role
  /** slug کافه‌هایی که این کاربر مالکشان است (تأییدشده). */
  ownedPlaceSlugs: string[]
  createdAt: string
  lastLoginAt: string | null
  /** مسدود — نمی‌تواند وارد شود. */
  blocked?: boolean
}

/** نشستی که به کامپوننت‌ها می‌رسد. بدون هیچ داده‌ی حساسی. */
export interface SessionUser {
  id: string
  phone: string
  name: string
  role: Role
  ownedPlaceSlugs: string[]
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === 'admin'
}

/** ادمین به همه‌ی قابلیت‌های مالک هم دسترسی دارد. */
export function isOwner(user: SessionUser | null): boolean {
  return user?.role === 'owner' || user?.role === 'admin'
}

export function ownsPlace(user: SessionUser | null, slug: string): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  return user.ownedPlaceSlugs.includes(slug)
}
