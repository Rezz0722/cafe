/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // فونت‌ها و عکس‌ها از public سرو می‌شوند. بهینه‌سازی تصویر Next به sharp نیاز
  // دارد که در این محیط نصب نشده؛ وقتی روی سرور واقعی رفتید این خط را بردارید
  // تا WebP/AVIF خودکار تولید شود.
  images: { unoptimized: true },

  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
