# QA بازطراحی تصویری Homepage

مرجع: [ماکاپ تأییدشده](qa/home-visual/reference.webp). Baseline واقعی Production: `d7f470b31a010e5606d79c9cec05bfa97bc02e24`.

اسکرین‌شات‌های Before از Production و After از `next start` روی Build ایزوله گرفته شده‌اند. هیچ فرم نظر، رزرو، Import یا عملیات نوشتن روی دادهٔ واقعی اجرا نشده؛ درخواست‌های Analytics در مرورگر QA پاسخ ۲۰۴ محلی گرفته‌اند.

## گیت‌های اجراشده

| بررسی | نتیجه و دامنه |
|---|---|
| Typecheck | Pass |
| ESLint | Pass |
| Unit | ۴۷۷ Pass، صفر Fail، ۱۶ Skip موجود |
| Build | Next.js Production Build موفق؛ ۶۲ صفحهٔ Static/SSG ساخته شد |
| Homepage visual | ۱۲ حالت: ۳۲۰×۵۶۸، ۳۶۰×۸۰۰، ۳۹۰×۸۴۴، ۴۳۰×۹۳۲، ۷۶۸×۱۰۲۴، ۱۴۴۰×۹۰۰؛ هر دو تم |
| Image load / SEO | تمام تصاویر Homepage بارگیری شدند؛ Canonical و JSON-LD موجود؛ صفر Overflow و خطای مرورگر در اجرای موفق نهایی |
| Review UI | ۱۲ حالت Light/Dark؛ سه نظر عمومی، لینک `#reviews`، رد افشای تماس و یک رویداد Analytics برای هر کلیک |
| Mini App | ۶۲ بررسی شامل Category Picker، یک Fullscreen، Navigation، History، Reviews، Information و نبود رزرو ساختگی |
| Search | ۶ ترکیب عرض/تم، فیلتر، تب آیتم و Dish Deep Link موفق |
| Homepage existing smoke | جست‌وجو، Query Mapping، هویت برند، موبایل ۳۲۰ تا ۴۳۰ و دسکتاپ موفق |
| PWA Footer | اتصال Prompt و لغو، پنهان‌شدن پس از `appinstalled`، راهنمای iOS، Fallback مرورگر و عدم CTA تکراری در `/install` موفق |
| Diff / secrets | `git diff --check` و بررسی Secrets موفق؛ Dependency تازه وجود ندارد |

۱۶ Skip محلی همگی Integrationهای opt-in دیتابیس/HTTP هستند. Workflow موجود CI آن‌ها را با Flagهای اختصاصی روی MariaDB Disposable جدا اجرا می‌کند؛ موفقیت همان CI روی Head نهایی شرط Merge است. هیچ Flag تست نوشتن روی اتصال Production فعال نشده است.

## اندازه‌گیری و بازبینی بصری

- در ۳۹۰ پیکسل، انتهای Hero همچنان در مختصات ۳۸۱ است؛ آغاز سکشن نظرها از ۷۷۰ به ۶۴۰ رسیده، بدون جابه‌جاکردن ترتیب سکشن‌های اعتمادساز.
- طول صفحهٔ موبایل صرفاً برای کمترشدن عدد کوتاه نشده: تصاویر خوانا و CTA نصب Footer بخشی از ارتفاع تازه‌اند. اندازه‌های واقعی در Metrics ثبت‌اند.
- در ۱۴۴۰ پیکسل، ارتفاع کامل از ۵۳۹۰ به ۴۵۷۹ پیکسل رسیده است؛ در ۳۹۰ پیکسل از ۵۰۵۸ به ۵۲۳۵ پیکسل. این اندازه‌گیری طول صفحه است و به‌عنوان معیار سرعت شبکه ارائه نمی‌شود.
- کارت غذا در موبایل دو ستون دارد؛ عنوان و Count خارج از Crop عکس قرار دارند. تصویرها در هر دو تم یکسان و بدون Invert هستند.
- تجربه‌ها به‌صورت Rail عمودی‌تصویر با کارت بعدی نیمه‌پیدا هستند. CTA «مشاهده همه تجربه‌ها» بیرون Rail و حداقل ۵۰ پیکسل است. CTA محله نیز مستقل است.
- گیت تکمیلی Swipe، صرفاً به `scrollWidth` اکتفا نمی‌کند: در موبایل باید بین ۲۰٪ و ۸۵٪ کارت دوم داخل نمای Rail دیده شود. مقدار واقعی در `nextCardVisibleFraction` فایل Metrics ثبت می‌شود. این گیت ضعف نسخهٔ اولیه در عرض‌های ۳۲۰/۳۶۰ را پوشش می‌دهد.
- نتیجهٔ Build نهایی در هر دو تم: در عرض‌های ۳۲۰، ۳۶۰، ۳۹۰ و ۴۳۰ به‌ترتیب ۶۴٪، ۶۶٪، ۶۷٪ و ۷۶٪ کارت دوم دیده می‌شود؛ هر ۱۲ حالت مرورگر موفق‌اند. عرض کارت دسکتاپ تغییر نکرده است.
- عکس محیط و لوگو در کارت نظر رفتار متفاوت دارند؛ نام تا دو خط جا دارد. هیچ Badge تأیید خرید ایجاد نشده است.
- کارت‌های پیشنهادی دیگر از ناحیهٔ عکس به پایین بریده نمی‌شوند. تست، `scrollHeight/clientHeight` کارت را کنترل می‌کند.
- CTAهای موبایل با Bounding Box و نوار پایین واقعی بررسی می‌شوند. Screenshotهای Full Page و First Fold نوار ثابت را حفظ می‌کنند؛ Cropهای تکیِ کامپوننت برای مقایسهٔ خود کارت، موقتاً نوار ثابت را پنهان می‌کنند.
- حجم ۱۹ Asset این صفحه **۹۸۸۹۶۶ بایت** است. تجربه‌ها **۵۷۵۴۸۰** بایت‌اند، در برابر **۲۵۹۸۰۴۰** بایت منبع قبلی. First Load JS گزارش Build حدود **۱۱۱ کیلوبایت** است. سرعت واقعی شبکهٔ گوشی ادعا نشده است.

## تصاویر مقایسه‌ای

| نما | قبل | بعد |
|---|---|---|
| First fold، ۳۹۰ روشن | [Before](qa/home-visual/before/first-fold-390-light.jpg) | [After](qa/home-visual/after/first-fold-390-light.jpg) |
| موبایل کامل، روشن | [Before](qa/home-visual/before/home-390-light.jpg) | [After](qa/home-visual/after/home-390-light.jpg) |
| موبایل کامل، تیره | [Before](qa/home-visual/before/home-390-dark.jpg) | [After](qa/home-visual/after/home-390-dark.jpg) |
| دسکتاپ کامل | [Before](qa/home-visual/before/home-1440-light.jpg) | [After](qa/home-visual/after/home-1440-light.jpg) |
| نظرها | [Before](qa/home-visual/before/reviews-light.jpg) | [After](qa/home-visual/after/reviews-light.jpg) |
| تجربه‌ها | [Before](qa/home-visual/before/experiences-light.jpg) | [After](qa/home-visual/after/experiences-light.jpg) |
| غذا | [Before](qa/home-visual/before/food-light.jpg) | [After](qa/home-visual/after/food-light.jpg) |
| محله | [Before](qa/home-visual/before/districts-light.jpg) | [After](qa/home-visual/after/districts-light.jpg) |

تمام عرض‌ها و هر دو تم، به‌همراه [Metrics قبل](qa/home-visual/before/metrics.json) و [Metrics بعد](qa/home-visual/after/metrics.json)، در همین پوشه‌اند.

## خطاهای یافت‌شده در QA و نتیجهٔ رسیدگی

Mount دیرهنگام Media در سرور محلی با Restart محیط تست رفع شد. خطای `__name` در شبیه‌سازی رویداد نصب، در کد تست اصلاح شد. تست قدیمی منو پیش از Mount شدن Dialog شمارش می‌کرد؛ اکنون قبل از همان Assert منتظر نمایش واقعی Dialog می‌ماند و ۶۲ بررسی آن موفق‌اند.

در یک اجرای اولیهٔ هم‌زمان، React خطای Hydration گزارش کرد. نسخهٔ Development در ۱۲ حالت و سپس Build با شروع تازه در ۱۲ حالت بدون تکرار خطا گذشتند. Assert حذف نشده، `suppressHydrationWarning` جدیدی اضافه نشده و Gate صفر خطای مرورگر برای اجرای نهایی و Production حفظ شده است.

## محدودیت‌های صریح

- نصب واقعی روی Android/iPhone فیزیکی انجام نشده است؛ تست Prompt با رویداد مرورگر آزمایشی و راهنمای iOS با پروفایل مرورگر انجام شده. موفقیت نصب native ادعا نمی‌شود.
- نشست تست از پیش مجاز Production در این مأموریت موجود نبود؛ تست احرازشدهٔ Production انجام نشده است. پوشش RBAC/Booking/Events در CI ایزوله حفظ می‌شود.
- تصاویر غذا و تجربه نمادین‌اند. تصاویر محله گرافیک برند هستند؛ عکس مستند از محله‌ها موجود نبود. عکس و لوگوی کافهٔ واقعی از دادهٔ همان کافه می‌آید.
