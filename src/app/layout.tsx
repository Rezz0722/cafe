import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
