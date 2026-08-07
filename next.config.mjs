/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * بهینه‌سازی تصویر Next خاموش است.
   *
   * تصاویر از قبل در خط لوله‌ی تسک ۰۳ به WebP در دو اندازه تبدیل شده‌اند
   * (`scripts/media-download.ts`)، پس بهینه‌سازی در زمان درخواست کارِ تکراری
   * است. `sharp` نصب است و برای همان خط لوله استفاده می‌شود.
   */
  images: { unoptimized: true },

  eslint: { ignoreDuringBuilds: true },

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
  ...(process.env.BUILD_PARALLEL === '1'
    ? {}
    : { experimental: { workerThreads: false, cpus: 1 } }),
}

export default nextConfig
