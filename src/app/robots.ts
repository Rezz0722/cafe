import type { MetadataRoute } from 'next'
import { absoluteUrl, SITE_URL } from '@/routes'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /**
         * خود صفحهٔ search متادیتای noindex/follow دارد. در robots مسدودش
         * نمی‌کنیم چون crawler باید بتواند noindex را ببیند؛ URL مسدودشده
         * ممکن است بدون snippet در ایندکس بماند. فقط مسیرهای خصوصی بسته‌اند.
         */
        disallow: ['/admin', '/profile', '/auth', '/api/'],
      },
      {
        // crawler نتایج و ارجاع‌های ChatGPT؛ صریح نگه داشته شده تا تنظیمات
        // عمومی آینده ناخواسته دسترسی آن به محتوای عمومی را نبندد.
        userAgent: 'OAI-SearchBot',
        allow: '/',
        disallow: ['/admin', '/profile', '/auth', '/api/'],
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: ['/admin', '/profile', '/auth', '/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: SITE_URL,
  }
}
