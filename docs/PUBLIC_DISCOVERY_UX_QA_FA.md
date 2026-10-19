# شواهد QA تجربهٔ عمومی

۱۹ اکتبر ۲۰۲۶؛ مبنای قبل `502614abd2e28484ae775a16cfda982c15974c3c`. تصاویر «بعد» از اجرای واقعی مرورگر هستند، نه ماکاپ. Build یکپارچهٔ چهار شاخه روی `127.0.0.1:9095` اجرا شد؛ این شاخهٔ ترکیبی صرفاً محلی است و واحد انتشار نیست.

## نتایج اجرا

| گیت | نتیجه و روش |
|---|---|
| Production Build ترکیبی | PASS؛ Next 15.5.25، کامپایل، lint/types و تولید مسیرها موفق |
| Typecheck / ESLint | PASS روی ترکیب نهایی؛ `npm run typecheck` و `npm run lint` |
| بازدید مجدد ممیزی | PASS؛ ۶۳ مسیر اصلی + `/reviews`، در ۳۹۰×۸۴۴ تیره؛ صفر pageerror، تصویر شکستهٔ قابل‌مشاهده و overflow |
| Experience / District | PASS؛ ۷ مسیر × ۶ اندازه × ۲ تم = ۸۴ حالت؛ صفحه‌بندی، بدون تکرار نتایج، refresh، Back/Forward، SSR بدون JS |
| Food | PASS در اجرای نهایی Build؛ ۶ اندازه × ۲ تم، هاب/قهوه، تمام دسته‌های ممیزی‌شده، Sort، malformed/oversized/repeated query، ۴۰۴، JSON-LD، canonical و بدون JS |
| Reviews | PASS روی Build؛ CTA خانه، یک canonical پس از ناوبری، ۱۲+۳ نظر واقعی، تفکیک بلاگر، صفحه‌بندی/reload و بدون JS، نمای ۳۲۰/۳۹۰/۱۴۴۰ روشن/تیره |
| Cafe Mini App | PASS؛ ۶۲ بررسی روی Build؛ category-first، visual/simple، دسته و جست‌وجو، History، hashهای قدیمی، compare، reviews و SSR fallback |
| Supporting UX | PASS؛ ۷۲ حالت مستقل برای ۶ سطح × ۶ اندازه × ۲ تم؛ ۴ بررسی تکمیلی رنگ CTA مالک؛ اعتبارسنجی فرم خالی بدون POST، TOC و تاریخ GET/reset |
| نقشه و Journey | PASS؛ نقشهٔ محله → نشانگر واقعی وکیل‌آباد → انتخاب → فهرست محله → کافه؛ Map → List → Back با active صحیح |
| MariaDB مجزا | PASS؛ ۷ بررسی discovery: شمول کامل/رتبه‌بندی قبل از برش، مرز صفحات پایدار، رد draft/سیگنال منفی، scope خالی fail-closed، حفظ null/zero و timestamp؛ feed نظرات شامل ۲ بررسی moderation/privacy/page boundary |
| CI الزامی | هر PR روی Head نهایی و پس از هماهنگی با production باید `verify` موفق داشته باشد؛ لینک‌های دقیق در PRها/گزارش انتشار |

شش اندازه: ۳۲۰×۵۶۸، ۳۶۰×۸۰۰، ۳۹۰×۸۴۴، ۴۳۰×۹۳۲، ۷۶۸×۱۰۲۴، ۱۴۴۰×۹۰۰. ماتریس Food از ارتفاع ۹۰۰ استفاده می‌کند؛ ماتریس Experience/District و Mini App از ارتفاع‌های دقیق فوق استفاده می‌کنند.

## اندازه‌گیری قبل/بعد

اندازهٔ ثابت ۳۹۰، تم تیره؛ ارتفاع صفحه شامل Footer است، نه زمان شبکه. تغییر طول صفحه ادعای افزایش سرعت شبکه نیست.

| سطح | قبل | بعد | تصاویر |
|---|---:|---:|---|
| هاب تجربه‌ها | ۵٬۲۲۹px | ۲٬۷۳۰px | [قبل](qa/public-discovery/experience-hub-before.jpg) / [بعد](qa/public-discovery/experience-hub-after.jpg) |
| صبحانه | ۱۵٬۹۲۸px، ۶۰ کارت | ۴٬۸۲۶px، ۱۲ کارت اولیه | [قبل](qa/public-discovery/experience-breakfast-before.jpg) / [بعد](qa/public-discovery/experience-breakfast-after.jpg) |
| هاب محله‌ها | ۵٬۲۹۱px | ۲٬۳۹۴px | [قبل](qa/public-discovery/district-hub-before.jpg) / [بعد](qa/public-discovery/district-hub-after.jpg) |
| وکیل‌آباد | ۸٬۹۱۹px، ۳۸ کارت | ۴٬۱۶۲px، ۱۲ کارت اولیه | [قبل](qa/public-discovery/district-vakilabad-before.jpg) / [بعد](qa/public-discovery/district-vakilabad-after.jpg) |

نمونه‌های دیگر: [نظرات تیره](qa/public-discovery/reviews-dark.png)، [روشن](qa/public-discovery/reviews-light.png)، [active نقشه](qa/public-discovery/map-active-dark.png)، [هاب غذا](qa/public-discovery/food-hub-dark.png)، [قهوه روشن](qa/public-discovery/food-coffee-light.png)، [دسته‌های منو](qa/public-discovery/menu-categories-dark.png)، [منوی تصویری](qa/public-discovery/menu-visual-light.png). تصاویر قبل/بعد اصلاح‌های جانبی در [سند مستقل](PUBLIC_SUPPORTING_UX_FA.md) ثبت شده‌اند.

## شکست‌های حفظ‌شده و بازآزمایی

- CI مستندات/ابزار نهایی #90 یک کلید تکراری `theme` در خروجی JSON اسکریپت smoke را با TS2783 رد کرد. نام ورودی به `requestedTheme` تفکیک شد؛ خطا مربوط به ابزار QA بود، نه کد منتشرشده. پذیرش CI تنها روی Head اصلاح‌شده مجاز است.
- تست قدیمی Reviews صرفاً `.maplibregl-canvas` را می‌پذیرفت و Timeout شد. بررسی مستقل نشان داد renderer دوبعدی موجود، همان داده و ۲۳۳ مختصات معتبر را نمایش می‌دهد. تست اکنون هر دو renderer پشتیبانی‌شده را با ابعاد واقعی و الزام وجود marker می‌سنجد؛ کد نقشه تغییر نکرده است. اجرای نهایی PASS.
- Assert فوری Mini App قبل از commit شدن Screen انتخاب‌شده شکست خورد. انتظار صریح برای searchbox همان Screen اضافه شد؛ Assert حذف یا ضعیف نشد. اجرای کامل نهایی ۶۲ بررسی PASS.
- یک اجرای اولیهٔ Food یک React hydration #418 بدون ثبت URL داشت. تشخیص URL به تست اضافه شد؛ بازتولید متمرکز queryهای نامعتبر/۴۰۴ و اجرای کامل مستقلِ نهایی هیچ pageerror نداشتند. علت قطعی آن تک‌رخداد مشخص نشده؛ لاگ اولیه محفوظ و بررسی پس از انتشار الزامی است. هیچ خطایی با skip یا فیلتر متن حذف نشده است.
- در Next dev، متادیتای ناوبری گاهی canonical تکراری داشت؛ روی Build، CTA خانه دقیقاً یک canonical صحیح دارد. صفحه‌بندی جدید عمداً لینک SSR بومی است، نه بازنویسی navigation کافه.

## ایمنی، دسترس‌پذیری و محدودیت‌ها

- ارسال analytics از مرورگرهای QA قطع شد؛ تست Search نیز GET/HEAD-only است. هیچ منو، نظر، حساب، رزرو یا رویداد تولیدی برای تست ساخته نشد.
- تصویر Full Page به‌تنهایی مبنای انسداد Bottom Nav نیست: در ماتریس discovery اسکرول واقعی و bounding box صفحه‌بندی نسبت به nav بررسی شد؛ در سه Overview زنده هم Actionهای اصلی بالای nav بودند.
- disclosureها بومی و بدون JS قابل استفاده‌اند؛ keyboard، focus CTA، Escape منو و focus پنهان‌نشدن Screen در رگرسیون موجود حفظ شده‌اند. ممیزی رسمی screen reader یا گوشی فیزیکی ادعا نمی‌شود.
- آزمون‌های DB در اجرای واحد عمومی به‌علت guard محیط skip می‌شوند و در job مستقل MariaDB با flag صریح اجرا می‌شوند. skip ساختگی جدید اضافه نشده است. تعداد دقیق pass/skip در لاگ CI هر Head محفوظ است (برای Head نهایی #89: ۴۹۸ تست، ۴۸۱ pass، ۱۷ guard skip؛ jobهای Integration/HTTP جدا موفق‌اند).
- AUTHENTICATED PRODUCTION QA: NOT TESTED؛ نشست آزمایشی از پیش مجاز در دسترس نیست. RBAC، Booking، Events، Export و Timestamp در MariaDB/HTTP امضاشدهٔ CI بررسی می‌شوند؛ جایگزین ادعای آزمون عملیاتی نیستند.
- QR فعال تولیدی وجود نداشت؛ مسیر واقعی اختراع نشد. تست‌های QR ایزولهٔ CI و رفتار landing موجود حفظ شدند. نصب PWA روی گوشی واقعی و Excel Desktop در این مأموریت اجرا نشده‌اند.

## بازتولید

```sh
node --import tsx --conditions=react-server scripts/public-ux-audit-smoke.ts http://127.0.0.1:9095
node --import tsx --conditions=react-server scripts/public-discovery-pages-smoke.ts http://127.0.0.1:9095
QA_PRODUCTION_BUILD=1 node --import tsx --conditions=react-server scripts/public-reviews-ui-smoke.ts http://127.0.0.1:9095
node --import tsx --conditions=react-server scripts/public-food-discovery-smoke.ts http://127.0.0.1:9095
node --import tsx --conditions=react-server scripts/mobile-miniapp-ui-smoke.ts http://127.0.0.1:9095
node --import tsx --conditions=react-server scripts/search-ui-smoke.ts http://127.0.0.1:9095
```

ماتریس کامل و لاگ‌ها در `/var/qa/public-discovery-20261019/` محیط اجرا، تصاویر منتخب در مخزن. Hashهای داده و schema فقط شمار/Hash خروجی دارند و اطلاعات خصوصی منتشر نمی‌کنند.
