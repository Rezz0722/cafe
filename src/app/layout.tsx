import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { getCurrentUser } from '@/core/auth/currentUser'
import { SITE_URL } from '@/routes'
import './global.css'

/**
 * متادیتای پایه. هر صفحه `title` خودش را از طریق `generateMetadata` تعیین
 * می‌کند — که دقیقاً همان چیزی است که نسخه‌ی SPA نداشت: آنجا یک `<title>`
 * ثابت در `index.html` بود و همه‌ی صفحات برای گوگل عنوان یکسان داشتند.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'کافه‌گرد — امروز کجا بریم؟',
    template: '%s | کافه‌گرد',
  },
  description:
    'راهنمای کافه‌ها و رستوران‌های مشهد. اسم جایی رو نگو، حالت رو بگو — بر اساس نیتت جای مناسب رو پیدا کن.',
  applicationName: 'کافه‌گرد',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: 'کافه‌گرد',
    title: 'کافه‌گرد — امروز کجا بریم؟',
    description: 'راهنمای کافه‌ها و رستوران‌های مشهد. اسم جایی رو نگو، حالت رو بگو.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#5996FF',
  width: 'device-width',
  initialScale: 1,
}

/**
 * نشست یک‌بار در ریشه خوانده و به کل درخت داده می‌شود.
 *
 * هزینه‌اش را بدانید: `getCurrentUser()` کوکی می‌خواند و خواندن کوکی در layout
 * ریشه، هر مسیری را داینامیک می‌کند — یعنی صفحات کافه و محله دیگر در build
 * پیش‌تولید نمی‌شوند. جایگزینش این بود که هدر نشست را با یک fetch کلاینتی
 * بگیرد، که همان پرشِ «ورود ← پروفایل» را برمی‌گرداند. وقتی PPR پایدار شد،
 * درست‌ترین کار این است که فقط `SiteHeader` داخل مرز داینامیک برود.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()

  return (
    <html lang="fa" dir="rtl">
      <body>
        <Providers user={user}>{children}</Providers>
      </body>
    </html>
  )
}
