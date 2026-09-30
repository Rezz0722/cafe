# ممیزی و Gap Map بازطراحی Kucafe v3

تاریخ ممیزی: ۱۴۰۵/۰۶/۱۸ (2026-09-09)

## ۱. وضعیت واقعی فعلی

- Runtime: Next.js 15، React 19، TypeScript، App Router، Server Components و Server Actions
- Data: MySQL/MariaDB با Drizzle ORM و ۳۷ جدول
- Deployment: Node/PM2 پشت Apache؛ یک process برای سازگاری cacheهای درون‌پردازه‌ای
- دادهٔ واقعی: ۳۳۱ مکان، ۳۲۶ منتشرشده، ۱۹٬۳۸۶ آیتم منو، ۱۴٬۴۷۹ تصویر آماده، ۳۵ facet، ۹۸ dish، ۲۳۹ مکان دارای مختصات و ۲۷ محلهٔ فعال
- کیفیت فعلی: ۲۴۹ تست واحد سبز؛ query smoke و typecheck مستقیم TypeScript سبز

## ۲. مرجع طراحی داخل `kucafe.zip`

ZIP شامل یک Prototype استاتیک RTL و ۱۰ ماکاپ (۵ دسکتاپ و ۵ موبایل) برای خانه، جست‌وجو، جزئیات کافه، پروفایل و پنل کافه‌دار است. Prototype از نظر طراحی مرجع است، اما تمام داده‌ها، جست‌وجو، فیلترها، علاقه‌مندی‌ها، Auth، نقشه و آمار آن نمونه یا fake هستند.

تعارض مهم: Prompt Pack داخل ZIP مهاجرت به PHP را پیشنهاد می‌کند، اما درخواست فعلی کاربر و سیستم واقعی Node/Next.js است. تصمیم قطعی این نسخه: **مهاجرت به PHP ممنوع؛ معماری Next.js و تمام قابلیت‌های سالم موجود حفظ می‌شوند.**

## ۳. ماتریس KEEP / IMPROVE / REBUILD

| حوزه | وضعیت | تصمیم |
| --- | --- | --- |
| دیتابیس، slugها، منو و قیمت | سالم و واقعی | KEEP |
| Auth، Session، RBAC و Server Actions | کامل‌تر از Prototype | KEEP + hardening تدریجی |
| Search platform و URL filters | غنی و کاربردی | KEEP + IMPROVE layout |
| MapLibre آفلاین | عملیاتی | KEEP + lazy loading |
| SEO، sitemap، canonical و JSON-LD | عملیاتی | KEEP |
| Design tokens | نزدیک به مرجع ولی پراکنده | IMPROVE و semantic consolidation |
| Header/Footer مشترک همهٔ routeها | contextها را مخلوط می‌کند | REBUILD shell behavior |
| Homepage | از نظر داده قوی، از نظر وعده/داده چند تناقض | IMPROVE |
| Search desktop/mobile | منطق قوی، hierarchy و responsive ضعیف | REBUILD presentation |
| Cafe detail | منو و تصمیم‌سازی قوی، گالری/اشتراک ناقص | IMPROVE |
| Profile | واقعی و غنی ولی utility-looking | IMPROVE |
| Owner/Admin | عملیاتی ولی فاقد shell بصری منسجم | IMPROVE |
| PHP/hash routes/localStorage mock | فقط Prototype | REMOVE from target |

## ۴. Gapهای اصلی

| Requirement | وضعیت | اقدام |
| --- | --- | --- |
| Responsive recomposition واقعی | NEEDS_REBUILD | desktop sidebar/grid و mobile rails/sheets |
| CTAهای mood با نتیجهٔ واقعی | CONFLICTING | فقط intent دارای پوشش یا fallback داده‌محور |
| Featured editorial | PARTIAL | تا وجود CMS از ادعای «دست‌چین» پرهیز شود |
| Trust strip | MISSING | با گزاره‌های قابل اثبات و آمار واقعی اضافه شود |
| District discovery تصویری | PARTIAL | کارت محدود و شمار واقعی؛ بدون تصویر جعلی مکان |
| Gallery کافه | PARTIAL | فقط media واقعی همان کافه/منو؛ `place_photo` فعلاً خالی است |
| Share action | MISSING | Web Share + clipboard fallback |
| Mobile bottom navigation | MISSING | فقط routeهای public و top-level |
| WCAG 2.2 AA | PARTIAL | primary strong، target 44px، aria state و focus |
| Zero-result logging | PARTIAL | writer موجود را در search وصل کن |
| Saved-card district | BUG | join با district و نمایش نام واقعی |
| Recommendation attributes | BUG | استفاده از `place_attribute` به‌جای آرایهٔ خالی |
| Near-me global correctness | PARTIAL/HIGH RISK | فاز بعد: lat/lng server-side قبل از limit/pagination |
| Place photos/upload | MISSING | فاز بعد با MIME/size/resize/audit؛ UI جعلی نساز |
| Active session revocation | PARTIAL | فاز امنیتی مستقل و migration-safe |

## ۵. ریسک‌های نسخهٔ زنده

- `.env.local` در checkout توسعه با credential فرآیند production همسان نیست؛ قبل از deploy باید یک Source of Truth تعیین شود.
- shimهای `node_modules/.bin/next` و `tsc` در این checkout کپی ناقص‌اند؛ باینری واقعی بسته مستقیم اجرا می‌شود، اما deploy باید `npm ci` سالم داشته باشد.
- سه intent اصلی خانه دربه‌جای نتیجهٔ مفید به صفر نتیجه می‌رسند؛ ادعای محصول باید با coverage داده هم‌راستا شود.
- سفید روی `#5996FF` کنتراست کافی ندارد؛ CTA باید `#2F6FE0` یا تیره‌تر باشد.
- `place_photo` صفر رکورد دارد؛ تصاویر عمومی Prototype نباید به یک کافهٔ واقعی نسبت داده شوند.
- نزدیک من فعلاً فقط page دریافت‌شده را در کلاینت مرتب می‌کند، نه کل مجموعه را.

## ۶. ترتیب اجرا

1. تثبیت tokens، shell و navigation
2. بازطراحی خانه با دادهٔ واقعی
3. بازترکیب Search و کارت‌ها بدون تغییر contract URL
4. گالری/اشتراک و hierarchy صفحهٔ کافه
5. بازطراحی Profile و Owner/Admin با حفظ فرم‌ها و actionها
6. رفع باگ‌های کم‌ریسک data mapping و logging
7. unit/type/build/smoke و بررسی responsive/accessibility
8. preview روی 9090؛ سپس deploy کنترل‌شده با backup و PM2 reload
