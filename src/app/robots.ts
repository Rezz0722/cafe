import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/routes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      /**
       * `/search` بی‌نهایت ترکیب فیلتر دارد؛ ایندکس‌شدنش یعنی هزاران صفحه‌ی
       * تکراری. صفحاتی که باید ایندکس شوند، صفحات ساخت‌یافته‌ی
       * `/mashhad/[district]/[intent]` هستند.
       */
      disallow: ['/search', '/admin', '/profile', '/auth', '/api/'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
