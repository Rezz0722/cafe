/**
 * ⚠️ پسوند `.cjs` اجباری است، نه `.js`.
 *
 * `package.json` این پروژه `"type": "module"` دارد، پس Node هر `.js` را
 * ESM می‌شمارد و `module.exports` پایین با
 * «ReferenceError: module is not defined in ES module scope» می‌ترکد — که
 * PM2 آن را «File ecosystem.config.js malformated» گزارش می‌کند و اپ اصلاً
 * بالا نمی‌آید. روی سرور واقعی همین اتفاق افتاد.
 *
 * PM2 پسوند `.cjs` را پشتیبانی می‌کند و مسئله را کامل حل می‌کند.
 */

/**
 * پیکربندی PM2 برای «کو کافه».
 *
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save && pm2 startup      # بالا آمدن خودکار بعد از ری‌بوت
 *   pm2 logs kucafe
 *   pm2 reload kucafe            # ری‌لود بی‌قطعی بعد از دیپلوی
 *
 * ═══ چرا `fork` با یک instance و نه `cluster` با «max» ═══
 *
 * این تصمیمِ عمدی است، نه محافظه‌کاری.
 *
 * اپ چند کشِ **درون‌فرآیندی** دارد که با نوشتنِ ادمین باطل می‌شوند:
 *
 *   `invalidateReferenceCache()`  محله‌ها، facetها، دیش‌ها، آمار سایت
 *   `invalidateSiteMean()`        میانگین امتیاز — پایه‌ی رتبه‌بندی بیزی
 *   `invalidateSettings()`        تنظیمات سایت از پنل ادمین
 *   `getPublishedMap()`           مانیفست نقشه
 *
 * در حالت `cluster` با N worker، هر کدام کشِ خودش را دارد و آن توابع فقط
 * کشِ worker ای را می‌ریزند که *اتفاقاً* درخواست را گرفته. نتیجه: ادمین
 * قیمت را عوض می‌کند، صفحه را رفرش می‌کند، و بسته به اینکه به کدام worker
 * افتاده مقدار قدیم یا جدید می‌بیند. اشکالی که پیدا کردنش ساعت‌ها می‌برد.
 *
 * برای این حجم — ۳۳۱ کافه، پرس‌وجوهای زیر ۱۰۰ میلی‌ثانیه، نقشه که کاملاً
 * استاتیک از nginx می‌آید — یک فرآیند به‌راحتی کافی است.
 *
 * ═══ اگر روزی واقعاً به چند worker نیاز شد ═══
 *
 * سه راه، به ترتیب ترجیح:
 *   ۱. کش‌ها به Redis منتقل شوند (اشتراکی و قابل‌باطل‌کردن از هر worker).
 *   ۲. `REFERENCE_CACHE_TTL_MS` پایین بیاید و ناسازگاریِ چندثانیه‌ای پذیرفته
 *      شود — برای داده‌ی مرجع قابل قبول است، برای تنظیمات نه.
 *   ۳. nginx با `ip_hash` هر کاربر را به یک worker بچسباند — نشست‌ها را
 *      درست می‌کند ولی مسئله‌ی کش را حل نمی‌کند.
 *
 * تا آن روز، `instances: 1` تنها حالتِ **درست** است.
 */

module.exports = {
  apps: [
    {
      name: 'kucafe',
      /*
        `npm start` را صدا نمی‌زنیم: با آن، PM2 فرآیندِ npm را می‌بیند نه
        Next را — سیگنال‌ها به فرزند نمی‌رسند و `pm2 reload` به kill سخت
        تبدیل می‌شود. اجرای مستقیمِ باینری، PM2 را مالکِ خودِ فرآیند می‌کند.
      */
      script: './node_modules/next/dist/bin/next',
      args: 'start --port 3000 --hostname 127.0.0.1',
      cwd: __dirname,

      exec_mode: 'fork',
      instances: 1,

      /*
        ری‌استارت خودکار وقتی حافظه از حد گذشت.

        Next با کشِ خودش حافظه را آرام‌آرام بالا می‌برد؛ این سقف جلوی
        OOM-killer را می‌گیرد و ری‌استارت را به یک لحظه‌ی کوتاهِ کنترل‌شده
        تبدیل می‌کند. روی VPS کوچک‌تر از ۲ گیگ، این عدد را پایین بیاورید.
      */
      max_memory_restart: '900M',

      /*
        `--max-semi-space-size` نه: heap پیش‌فرض Node برای این اپ کافی است و
        دست‌کاری‌اش بدون اندازه‌گیری، ضرر دارد.

        `NODE_ENV=production` اجباری است — بدون آن Next در حالت توسعه بالا
        می‌آید، کامپایل در لحظه انجام می‌دهد و چند برابر کندتر است.
      */
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOSTNAME: '127.0.0.1',
      },

      /*
        بقیه‌ی متغیرها (`DATABASE_URL`، `SESSION_SECRET`، `SMSIR_*`،
        `ADMIN_PHONES`، `AUTH_DEV_MODE=false`) اینجا **نوشته نمی‌شوند** و در
        `.env.local` روی سرور می‌مانند.
        این فایل در git است؛ راز در git، راز نیست.
      */

      // ── لاگ
      output: './logs/kucafe-out.log',
      error: './logs/kucafe-error.log',
      merge_logs: true,
      time: true,

      /*
        سقفِ ری‌استارتِ پشت‌سرهم.

        اگر اپ به‌خاطر خطای پیکربندی (مثلاً `DATABASE_URL` غلط) بالا نیاید،
        PM2 بی‌نهایت تلاش نمی‌کند و لاگ را با یک خطای تکراری پر نمی‌کند.
        وضعیت `errored` می‌شود که در `pm2 list` دیده می‌شود.
      */
      max_restarts: 10,
      min_uptime: '20s',
      restart_delay: 3000,
      autorestart: true,

      /*
        `watch: false` روی تولید اجباری است. با `true`، هر نوشتنِ Next در
        `.next/` یک ری‌استارت می‌سازد و سرور در حلقه می‌افتد.
      */
      watch: false,

      /*
        مهلتِ خاموشیِ نرم.

        Next اتصال‌های باز و نوشتن‌های در جریان (اکشن‌های سرور) را باید تمام
        کند. `kill_timeout` کوتاه، وسطِ یک ثبت نظر یا ذخیره‌ی تنظیمات
        قطع می‌کند.
      */
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      wait_ready: false,
    },
  ],
}
