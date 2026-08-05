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
   * ═══ تنظیمات حافظه — این ماشین ۴ گیگابایت RAM دارد ═══
   *
   * build پیش‌فرض Next چند worker موازی می‌سازد و هر کدام یک heap مستقل
   * می‌گیرد. روی ماشینی که MySQL هم رویش است، جمعشان از حافظه‌ی فیزیکی رد
   * می‌شود و build با segfault می‌ترکد (کد ‎3221225477 روی ویندوز = نقض
   * دسترسی حافظه).
   *
   * `workerThreads: false` و `cpus: 1` کامپایل را تک‌فرآیندی می‌کنند: کندتر
   * ولی قابل اتمام. روی سرور با حافظه‌ی بیشتر می‌شود برداشتشان.
   */
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
}

export default nextConfig
