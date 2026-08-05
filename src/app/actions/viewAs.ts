'use server'

/**
 * اکشن‌های «مشاهده به‌عنوان» — جدا از بقیه‌ی اکشن‌های ادمین.
 *
 * ═══ چرا فایل جدا ═══
 *
 * نوار «مشاهده به‌عنوان» در **layout ریشه** رندر می‌شود، یعنی در هر صفحه‌ی
 * سایت. اگر اکشن خروجش را از `app/admin/actions.ts` بگیرد، کل زنجیره‌ی
 * ایمپورت آن فایل (مدیریت مکان، منو، کاربران) به bundle هر صفحه وصل می‌شود —
 * حتی صفحه‌ی یک کافه‌ی عمومی.
 *
 * این فایل فقط به نشست و کوکی دست می‌زند، پس سبک می‌ماند.
 */

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { stopViewAs } from '@/core/auth/impersonation'
import { paths } from '@/routes'

/** بازگشت به حساب خودِ ادمین. فقط یک کوکی پاک می‌شود. */
export async function stopViewAsAction(): Promise<void> {
  await stopViewAs()
  // `layout` لازم است نه فقط صفحه: نوار در layout است و بدون این، بعد از
  // خروج هم روی صفحه می‌ماند.
  revalidatePath('/', 'layout')
  redirect(paths.admin)
}
