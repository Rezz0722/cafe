# انتشار مرحله‌ای بازطراحی موبایل KuCafe

## Stage A — صفحهٔ اصلی

PR [#79](https://github.com/Rezz0722/cafe/pull/79) روی Production ادغام و با Commit `c5e4012406eb5ef2da4ead09fc1e1aa9c727c7db` منتشر شد. [Workflow انتشار](https://github.com/Rezz0722/cafe/actions/runs/39007351123) موفق بود. App و TopMenu Worker روی همان Image سالم بودند؛ صفحهٔ اصلی، Search، صفحهٔ کافهٔ نمونه، `robots.txt` و Manifest Smoke شدند. تعداد کافه/دسته/آیتم/Variant و Fingerprint زمان‌های حساس قبل/بعد برابر بود. نسخهٔ قبلی و Backup پیش از انتشار باقی ماندند.

## Stage B — Cafe Mini App

این سند همراه کد در PR مستقل منتشر می‌شود. SHA و Workflow نهایی Merge در زمان نوشتن Commit این سند هنوز وجود ندارند؛ نتیجهٔ عملیاتی پس از Deploy باید در گزارش اجرایی دانلودی و توضیح PR ثبت شود. هیچ‌کدام را پیشاپیش موفق اعلام نکنید.

تغییرات Stage B: چهار Screen واقعی در موبایل، Navigation URL-based و Back/Forward، منوی یک‌لمسی بدون Modal دوم، خلاصهٔ فشرده، Empty State یکپارچهٔ تجربه‌ها، Screen اطلاعات، رنگ Light/Dark هماهنگ، مقایسهٔ قیمت بدون انتظار نمایشی و حفظ CTA رزرو Opt-in.

گیت‌های اجراشده قبل از PR: Typecheck، Lint، `git diff --check`، کنترل Secrets، ۴۷۰ تست واحد Pass/۱۵ Skip، Build ایزولهٔ Next.js، ۶۲ کنترل مرورگر در شش Viewport و دو تم، Booking HTTP/Browser، Events HTTP/Browser و RBAC روی MariaDB Disposable. برای نتیجهٔ CI باید آخرین Head SHA همان PR بررسی شود؛ نتیجهٔ محلی جایگزین CI نیست.

## Preflight و ترتیب انتشار Stage B

1. PR فقط تغییرات همین Scope و گزارش P2-05 محفوظ را داشته باشد. PR [#78](https://github.com/Rezz0722/cafe/pull/78) تا ورود واقعی آن گزارش به Production باز بماند.
2. CI دقیق آخرین Head سبز باشد. Production هنوز Stage A سالم و App/Worker/DB بدون خطای جدید باشند. Deploy یا TopMenu Apply هم‌زمان فعال نباشد.
3. Backup تازه و `gzip -t`، Imageهای rollback، فضای دیسک و وضعیت Migration بررسی شوند. این تغییر Migration ندارد و هیچ Apply اسکرپر مجاز نیست.
4. فقط PR Cafe Mini App Merge شود و Workflow تا پایان واقعی رصد شود.
5. Runtime SHA و Image App/Worker با Merge مطابقت داشته باشند؛ Home، Search، Cafe Overview/Menu/Reviews/Info، Request Route، Events، QR عمومی، robots و Manifest Smoke شوند.
6. SSR خام منو/نظر/Canonical، Deep Linkها، Back/Forward، نبود Overflow، کافهٔ فاقد رزرو، و Integrity شمار رکوردها/زمان‌های حساس بررسی شوند. تست احرازشدهٔ Production فقط با نشست از پیش مجاز و بدون Write؛ در غیر این صورت `NOT TESTED`.
7. اگر هر گیت بحرانی شکست خورد، App و Worker به Image سالم قبلی بازگردند؛ دیتابیس و Migration حذف یا از Backup کورکورانه بازنویسی نشوند.

## محدودیت‌های پذیرش

تست روی iOS Safari و Android Chrome فیزیکی، QR چاپ‌شده و نشست واقعی مالک بخشی از آزمون میدانی است. CI/Chromium ایزوله جای آن را نمی‌گیرد. هیچ درخواست رزرو، ثبت تجربه یا ویرایش منوی واقعی برای QA انجام نشود.

گزارش انتشار P2-05 در `docs/P2_05_PRODUCT_RELEASE_FA.md` با محتوای قبلی حفظ شده و تنها پس از ورود واقعی این فایل به Production می‌توان PR #78 را با توضیح Superseded بست.
