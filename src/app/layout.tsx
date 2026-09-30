import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Providers } from '@/components/Providers'
import { ViewAsBanner } from '@/components/admin/ViewAsBanner'
import { PageViewTracker } from '@/components/analytics/PageViewTracker'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { MobileBottomNav } from '@/components/layout/MobileBottomNav'
import { PwaStatus } from '@/components/pwa/PwaProvider'
import { AnnouncementBar } from '@/components/site/AnnouncementBar'
import { getSession } from '@/core/auth/currentUser'
import { getSettings } from '@/core/settings/store'
import { SITE_URL } from '@/routes'
import { THEME_INIT_SCRIPT } from '@/core/theme/theme'
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
    creator: s.siteName,
    publisher: s.siteName,
    formatDetection: { telephone: false, address: false, email: false },
    icons: {
      icon: [{ url: '/brand/favicon-64.png', sizes: '64x64', type: 'image/png' }],
    },
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'fa_IR',
      siteName: s.siteName,
      title: headline,
      description: s.siteDescription,
      images: [
        {
          url: '/brand/og-home.png',
          width: 1200,
          height: 630,
          alt: `${s.siteName}؛ راهنمای کافه و رستوران`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: headline,
      description: s.siteDescription,
      images: ['/brand/og-home.png'],
    },
    // در حالت تعمیر، ایندکس‌شدنِ صفحه‌ی «موقتاً بسته» یعنی همان چیزی که در
    // نتیجه‌ی گوگل می‌ماند. تا وقتی بسته است، از ایندکس بیرون می‌ماند.
    robots: s.maintenanceMode ? { index: false, follow: false } : { index: true, follow: true },
  }
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
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
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {/* Chrome needs a manifest link in HEAD. Async generateMetadata can
            stream it into BODY; the file-based manifest may still emit that
            identical link later, but installation must not depend on it. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" sizes="180x180" type="image/png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="کوکافه" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
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
        {/*
          هدر و فوتر در layout ریشه‌اند، نه در هر صفحه.

          قبلاً فقط `page.tsx` و `not-found.tsx` رندرشان می‌کردند — یعنی
          صفحه‌ی کافه، جست‌وجو، محله و پروفایل **هیچ هدری نداشتند**. کاربری که
          از گوگل مستقیم روی صفحه‌ی یک کافه می‌آمد، هیچ راهی به بقیه‌ی سایت
          نداشت: نه لوگو، نه دکمه‌ی خانه، نه منو. اینجا بودنشان یعنی هر صفحه‌ی
          حالا و آینده خودبه‌خود دارَدشان.

          پنل‌های ادمین و کافه‌دار هم همین هدر را می‌گیرند و این درست است —
          ناوبریِ برگشت به سایت، همان چیزی است که آنجا هم کم بود.
        */}
        {/*
          ⚠️ هدر **داخل** `Providers` است، نه بیرونش.

          `SiteHeader` از `useAuth()` استفاده می‌کند و آن هوک بدون
          `AuthProvider` استثنا می‌دهد. با هدرِ بیرونی، *هر صفحه‌ی سایت* با
          «useAuth must be used inside AuthProvider» می‌افتاد — یعنی یک خطای
          ۵۰۰ سراسری، نه یک ایراد موضعی.
        */}
        <Providers user={user}>
          <a href="#main-content" className="skip-link">رفتن به محتوای اصلی</a>
          <SiteHeader siteName={settings.siteName} />
          <PwaStatus />
          <div id="main-content" className="site-content" tabIndex={-1}>{children}</div>
          <MobileBottomNav />
          <SiteFooter siteName={settings.siteName} tagline={settings.siteTagline || undefined} />
        </Providers>
        {/* ثبت بازدید — بی‌صدا، و اگر مدیر خاموشش کرده باشد، اصلاً رندر نمی‌شود. */}
        {settings.trackPageViews && <PageViewTracker />}
      </body>
    </html>
  )
}
