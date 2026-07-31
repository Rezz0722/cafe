import type { Metadata } from 'next'
import { AdminPanel } from '@/components/admin/AdminPanel'

/**
 * پنل مالک کافه — خصوصی، پس از ایندکس بیرون است.
 *
 * هیچ داده‌ای اینجا بارگذاری نمی‌شود: پنل روی داده‌ی ساختگی
 * `data/adminSeed` کار می‌کند تا وقتی بک‌اند واقعی بیاید.
 */
export const metadata: Metadata = {
  title: 'پنل کافه',
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return <AdminPanel />
}
