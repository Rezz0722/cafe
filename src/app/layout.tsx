import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { ViewAsBanner } from '@/components/admin/ViewAsBanner'
import { PageViewTracker } from '@/components/analytics/PageViewTracker'
import { AnnouncementBar } from '@/components/site/AnnouncementBar'
import { getSession } from '@/core/auth/currentUser'
import { getSettings } from '@/core/settings/store'
import { SITE_URL } from '@/routes'
import './global.css'

/**
 * متادیتای پایه — از تنظیمات پنل ادمین ساخته می‌شود.
 *
 * هر صفحه `title` خودش را از طریق `generateMetadata` تعیین می‌کند؛ این‌ها
 * پیش‌فرض و قالب‌اند. اینکه `generateMetadata` است و نه یک `const`، برای این
 * است که نام و توضیح سایت در پنل قابل تغییر باشد بدون ری‌دیپلوی.
 */
export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings()
  const headline = s.siteTagline ? `${s.siteName} — ${s.siteTagline}` : s.siteName

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: headline, template: `%s | ${s.siteName}` },
    description: s.siteDescription,
    applicationName: s.siteName,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: s.siteName,
      title: headline,
      description: s.siteDescription,
    },
    // در حالت تعمیر، ایندکس‌شدنِ صفحه‌ی «موقتاً بسته» یعنی همان چیزی که در
    // نتیجه‌ی گوگل می‌ماند. تا وقتی بسته است، از ایندکس بیرون می‌ماند.
    robots: s.maintenanceMode ? { index: false, follow: false } : { index: true, follow: true },
  }
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
  /*
    `actor` فقط در حالت «مشاهده به‌عنوان» پر است. کلاسِ روی body، ارتفاع نوار
    را به CSS می‌دهد تا هم بالای صفحه جا باز شود و هم هدرهای sticky زیر نوار
    بایستند نه پشتش.
  */
  const [{ user, actor }, settings] = await Promise.all([getSession(), getSettings()])

  return (
    <html lang="fa" dir="rtl">
      <body className={actor ? 'viewing-as' : undefined}>
        {/* اعلان قبل از هر چیز دیگری — خواندنش نباید به اسکرول نیاز داشته باشد. */}
        <AnnouncementBar text={settings.announcement} />
        {actor && user && (
          <ViewAsBanner
            targetName={user.name}
            targetPhone={user.phone}
            targetRole={user.role}
            actorName={actor.name || 'ادمین'}
          />
        )}
        <Providers user={user}>{children}</Providers>
        {/* ثبت بازدید — بی‌صدا، و اگر مدیر خاموشش کرده باشد، اصلاً رندر نمی‌شود. */}
        {settings.trackPageViews && <PageViewTracker />}
      </body>
    </html>
  )
}
