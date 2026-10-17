# شواهد بصری و کارکردی Discovery / Mini App 2.0

وضعیت: **آمادهٔ بازبینی بصری، منتشر نشده**. PRهای [Mini App #81](https://github.com/Rezz0722/cafe/pull/81)، [Homepage #82](https://github.com/Rezz0722/cafe/pull/82) و [Reviews #83](https://github.com/Rezz0722/cafe/pull/83) جدا هستند؛ #83 روی #82 قرار دارد. نتیجهٔ CI هر Head باید در خود PR بررسی شود.

## قبل و بعد در ۳۹۰×۸۴۴

| شاخص | Production قبل | Homepage #82 | Homepage + Reviews #83 |
|---|---:|---:|---:|
| ابتدای جست‌وجو از بالای صفحه | ۳۷۹px | ۲۴۲px | ۲۴۲px |
| ابتدای دسته‌بندی سریع | ۱۲۸۲px | ۴۳۵px | ۴۳۵px |
| ابتدای تجربه‌های واقعی | ندارد | ندارد | ۷۷۰px |
| ارتفاع کل صفحه | ۶۵۹۸px | ۴۳۵۴px | ۵۲۳۹px |
| تعداد Section اصلی | ۸ | ۸ | ۹ |
| سرریز افقی | ۰ | ۰ | ۰ |

اعداد از Playwright و `getBoundingClientRect` به‌دست آمده‌اند. دادهٔ #82 در [metrics پایه](qa/home-discovery/metrics.json) و #83 در [metrics نظرها](qa/trusted-reviews/metrics.json) است. نسخهٔ دارای نظرها هنوز ۱۳۵۹px کوتاه‌تر از Production پیشین است، اما کوتاهی صفحه به‌تنهایی معیار پذیرش نیست.

## اسکرین‌شات‌های واقعی

| سطح | قبل | بعد |
|---|---|---|
| First Fold تاریک | [Production](qa/home-discovery/first-fold-before-390-dark.png) | [Homepage #82](qa/home-discovery/first-fold-after-390-dark.png) |
| First Fold روشن | [Production](qa/home-discovery/first-fold-before-390-light.png) | [Homepage #82](qa/home-discovery/first-fold-after-390-light.png) |
| کل صفحه در تم تاریک | [Production](qa/home-discovery/full-before-390-dark.png) | [Homepage #82](qa/home-discovery/full-after-390-dark.png) |
| نظرهای تأییدشده، موبایل | بخش مستقل ندارد | [تاریک](qa/trusted-reviews/reviews-390-dark.png) / [روشن](qa/trusted-reviews/reviews-390-light.png) |
| نظرهای تأییدشده، دسکتاپ | بخش مستقل ندارد | [تاریک](qa/trusted-reviews/reviews-1440-dark.png) / [روشن](qa/trusted-reviews/reviews-1440-light.png) |

تصاویر `fullPage` هنگام ساخت فایل می‌توانند Navigation ثابت را در میانهٔ صفحهٔ مرکب تکرار کنند؛ تصویر Viewport و آزمون تعامل، مرجع بررسی Header و Bottom Navigation هستند. اسکرین‌شات‌های قبل/بعد Overview و Menu در [سند Mini App](https://github.com/Rezz0722/cafe/blob/fix/mobile-miniapp-ux-refinement/docs/MOBILE_MINIAPP_REFINEMENT_FA.md) قرار دارند.

## تعامل و دسترس‌پذیری

- از Home تا مسیر غذا/حال‌وهوا/محله: یک لمس. از Home تا متن نظر همان کافه: یک لمس. در Mini App از Overview تا دستهٔ خاص منو: دو لمسِ روشن (منو → دسته)، به‌جای فرود نامفهوم روی آیتم‌های دستهٔ اول.
- CTA بزرگ تکراری منو در Mini App حذف شده و یک اقدام اصلی در Overview می‌ماند. در Home، Artwork بزرگ Hero و چند بخش معرفی تکراری به ورودی‌های کاربردی و فشرده تبدیل شده‌اند.
- #81: آزمون URL، Back/Forward، Menu visual/simple، Focus، Escape، Booking CTA و ۶ عرض × دو تم؛ شواهد در همان PR. #82: ۱۲ حالت Light/Dark محلی + دو Baseline فقط‌خواندنی Production. #83: ۱۲ حالت Light/Dark روی Production Build محلی؛ سه کارت واقعی، لینک `#reviews`، یک Event کلیک، بدون شماره/ایمیل در خلاصه، بدون تصویر شکسته، Overflow یا خطای مرورگر.
- در عرض‌های ۳۲۰/۳۶۰/۳۹۰/۴۳۰/۷۶۸/۱۴۴۰ بررسی مرورگری شد. Snapshotهای اصلی ۳۹۰ و ۱۴۴۰ نگهداری شده‌اند؛ مجموعهٔ خام همهٔ اندازه‌ها در `var/qa` محلی است. Navigation ثابت هنگام اسکرول می‌تواند روی بخشی از کارت قرار گیرد؛ Padding پایین صفحه اجازهٔ ادامهٔ اسکرول را می‌دهد و لینک‌ها در QA قابل کلیک بودند.

## کارایی و ایمنی آزمون

سه درخواست گرم به Production Build محلی روی همان میزبان: #82 حدود `95–113ms` زمان رسیدن اولین بایت و `167499B` HTML؛ #83 حدود `74–112ms` و `182972B` HTML. این نمونهٔ کوچک نشانهٔ رگرسیون واضح محلی نیست، اما Benchmark یا Core Web Vitals Production هم نیست. Query نظر محدود به ۹۶ کافه، فقط یک ردیف جدیدترین نظر برای هر کافه و بدون N+1 است؛ تصویرهای پایین صفحه Lazy هستند.

در تمام Browser QA، POSTهای Analytics رهگیری و با پاسخ محلی خاتمه یافتند. Production فقط خوانده شد. هیچ نظر، رزرو، منو یا دادهٔ واقعی تغییر نکرد؛ هیچ Merge/Deploy/TopMenu Apply اجرا نشد. بازبینی بصری مالک پیش از انتشار الزامی است.
