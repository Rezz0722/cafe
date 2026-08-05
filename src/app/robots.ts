import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/routes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      /**
       * `/search` بی‌نهایت ترکیب فیلتر دارد؛ ایندکس‌شدنش یعنی هزاران صفحه‌ی
       * تکراری. صفحات کانونی که باید ایندکس شوند، صفحات محله
       * (`/mashhad/[district]`) و صفحات کافه هستند.
       */
      disallow: ['/search', '/admin', '/profile', '/auth', '/api/'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
