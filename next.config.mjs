import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * شناسهٔ نسخه باید هم هنگام build داخل باندل کلاینت باشد و هم هنگام `next
 * start` در دسترس سرور. safe-build آن را داخل distDir موفق نگه می‌دارد؛ پس
 * build شکست‌خورده هرگز شناسهٔ نسخهٔ زنده را عوض نمی‌کند.
 */
function deploymentId() {
  const fromBuild = process.env.NEXT_DEPLOYMENT_ID?.trim()
  if (fromBuild) return fromBuild

  try {
    const distDir = process.env.NEXT_DIST_DIR || '.next'
    return readFileSync(join(process.cwd(), distDir, 'DEPLOYMENT_ID'), 'utf8').trim() || undefined
  } catch {
    // اولین build هنوز فایل نسخه ندارد. safe-build مقدار را از env می‌دهد.
    return undefined
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The Docker runtime copies only the traced server and its runtime files.
  // This keeps the production image independent from the source tree and
  // development dependencies.
  output: 'standalone',
  deploymentId: deploymentId(),

  // build امن ابتدا در پوشهٔ staging ساخته می‌شود تا `next build` فایل‌های
  // سرویسی را که همین حالا پاسخ می‌دهد پاک نکند. در اجرای عادی همان `.next`
  // استفاده می‌شود؛ اسکریپت safe-build فقط هنگام ساخت این مقدار را عوض می‌کند.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * بهینه‌سازی تصویر Next خاموش است.
   *
   * تصاویر از قبل در خط لوله‌ی تسک ۰۳ به WebP در دو اندازه تبدیل شده‌اند
   * (`scripts/media-download.ts`)، پس بهینه‌سازی در زمان درخواست کارِ تکراری
   * است. `sharp` نصب است و برای همان خط لوله استفاده می‌شود.
   */
  images: { unoptimized: true },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'text/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/offline.html',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        source: '/:path*.mjs',
        headers: [{ key: 'Content-Type', value: 'text/javascript; charset=utf-8' }],
      },
      {
        source: '/seo-owner-actions.md',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Content-Type', value: 'text/markdown; charset=utf-8' },
          { key: 'Content-Disposition', value: 'attachment; filename="KUCAFE_SEO_OWNER_ACTIONS_FA.md"' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
          {
            key: 'Content-Security-Policy',
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'",
          },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/editorial/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=604800, stale-while-revalidate=2592000',
          },
        ],
      },
      ...['/logo.png', '/logo-sm.webp', '/favicon.svg', '/apple-touch-icon.png'].map(
        (source) => ({
          source,
          headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
        }),
      ),
    ]
  },

  // عکس منو در Server Action دریافت می‌شود؛ خود action دوباره نوع و سقف ۸MB
  // را کنترل می‌کند. یک مگابایت پیش‌فرض برای عکس مستقیم موبایل کافی نیست.
  experimental: {
    serverActions: { bodySizeLimit: '9mb' },
    ...(process.env.BUILD_PARALLEL === '1' ? {} : { workerThreads: false, cpus: 1 }),
  },

  /**
   * ═══ تنظیمات حافظه‌ی build ═══
   *
   * build پیش‌فرض Next چند worker موازی می‌سازد و هر کدام یک heap مستقل
   * می‌گیرد. روی ماشین توسعه (۴ گیگ، با MySQL روی همان ماشین) جمعشان از
   * حافظه‌ی فیزیکی رد می‌شود و build با segfault می‌ترکد (کد ‎3221225477 روی
   * ویندوز = نقض دسترسی حافظه).
   *
   * `workerThreads: false` و `cpus: 1` کامپایل را تک‌فرآیندی می‌کنند: کندتر
   * ولی قابل اتمام.
   *
   * ═══ روی VPS این را روشن نگذارید ═══
   *
   * سرورِ تولید حافظه‌ی بیشتری دارد و این محدودیت فقط build را کند می‌کند.
   * با یک متغیر محیطی برداشته می‌شود:
   *
   *   BUILD_PARALLEL=1 npm run build
   *
   * پیش‌فرض همان حالتِ محافظه‌کارانه ماند تا build روی ماشین کوچک بی‌صدا
   * نشکند — کسی که سرور بزرگ دارد یک متغیر ست می‌کند، ولی کسی که ندارد
   * ساعت‌ها دنبال دلیلِ segfault می‌گردد.
   */
}

export default nextConfig
