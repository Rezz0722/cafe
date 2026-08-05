'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '@/hooks/useAuth'
import type { SessionUser } from '@/core/auth/types'

/**
 * تنها مرز client در ریشه‌ی درخت.
 *
 * Context فقط سمت کلاینت کار می‌کند، پس providerها باید در یک کامپوننت
 * `'use client'` باشند. اما `children` که از layout سرور می‌آید همچنان
 * server component می‌ماند — Next آن را از قبل رندر می‌کند و به‌عنوان
 * prop رد می‌کند. یعنی صفحات SSR خودشان را از دست نمی‌دهند.
 *
 * `user` هم از همان‌جا می‌آید: کوکی نشست httpOnly است و کلاینت نمی‌تواند
 * بخواندش، پس تنها راهِ رسیدن نشست به context، رد کردنش از سرور است.
 *
 * ═══ چرا «ذخیره‌شده‌ها» دیگر context ندارد ═══
 *
 * قبلاً فهرست ذخیره‌ها در `localStorage` و یک context کلاینتی بود. حالا در
 * جدول `saved_place` است: با هر دستگاهی که وارد شوی همان فهرست را می‌بینی، و
 * پنل ادمین هم می‌تواند ببیند کدام کافه‌ها بیشتر ذخیره می‌شوند. وضعیتِ دکمه
 * از سرور می‌آید و تغییرش با server action است.
 */
export function Providers({
  children,
  user,
}: {
  children: ReactNode
  user: SessionUser | null
}) {
  return (
    <AuthProvider user={user}>{children}</AuthProvider>
  )
}
