# P2-05 — وضعیت توسعه و انتشار

این سند checkpoint اجرایی است و باید در پایان مأموریت با شواهد نهایی به‌روز شود. هیچ قابلیتِ منتشرنشده‌ای در اینجا «منتشرشده» تلقی نمی‌شود.

## وضعیت تا ۱۶ اکتبر ۲۰۲۶

| بخش | شاخه / PR | وضعیت شواهد |
| --- | --- | --- |
| هستهٔ درخواست و Migration افزایشی 0018 | `feat/p2-05-booking-core` / [#74](https://github.com/Rezz0722/cafe/pull/74) | CI و [Workflow انتشار](https://github.com/Rezz0722/cafe/actions/runs/38921233849) موفق؛ Merge Commit و Runtime `7a09a5b7ef4d0aa07573ca0e921a60b5b626df1d` پس از Smoke پذیرفته شد. |
| فرم کاربر، پیگیری، پنل شعبه، اتصال Experience و انتخاب اقلام | `feat/p2-05-booking-experience` / [#75](https://github.com/Rezz0722/cafe/pull/75) | CI سبز؛ Merge Commit و Runtime `3a5f7e0e929281e42cdf6fc80885860b5d16abdc`؛ [Workflow](https://github.com/Rezz0722/cafe/actions/runs/38924998875) موفق، App/Worker سالم، Smoke عمومی موفق. هیچ شعبه‌ای فعال نشده است. |
| رویدادهای کافه و درخواست مشارکت، Migration افزایشی 0019 | `feat/p2-05-cafe-events` / [#76](https://github.com/Rezz0722/cafe/pull/76) | CI و [Workflow انتشار](https://github.com/Rezz0722/cafe/actions/runs/38959442135) موفق؛ Runtime `7b4d103886d9a7c991b308abb7f64fce2e19b8f2`، App/Worker سالم؛ بدون رویداد ساختگی. |
| به‌روزرسانی‌های داخل حساب و آمار تجمیعی ادمین | `feat/p2-05-product-integration` | QA ایزوله، Typecheck، Lint و Build موفق؛ هنوز Merge یا Deploy نشده است. |

## شواهد QA تاکنون

- MariaDB 10.6 دورریختنی: Migration 0018 از صفر و تست ثبت/لغو/تأیید/رقابت/بازگشت تراکنش موفق.
- MariaDB 11.4 دورریختنی: Migration و تست‌های هسته موفق.
- Playwright با نشست‌های امضاشدهٔ آزمایشی روی دیتابیس دورریختنی: فرم درخواست، انتخاب آیتم، ثبت Pending، پیگیری، پاسخ مالک و نمایش Confirmed موفق. نبود overflow افقی در عرض‌های ۳۲۰، ۳۶۰، ۳۹۰، ۴۳۰، ۷۶۸ و ۱۴۴۰ پیکسل بررسی شد.
- PR #75 تست HTTP مستقل برای SSR، no-store، ورود اجباری و رد نقش Staff دارد. تست مرورگر در CI پیش‌فرض فعال نیست و محلی اجرا شد.
- پیش از Merge #74، Production روی `a68f2102dff2f6bd2d7ffdaeb3d75cd1ffa6e567` بود؛ App/Worker سالم بودند. بکاپ مستقل `/var/backups/kucafe/db/manual-pre-p205-core-20261016T150252Z.sql.gz` با `gzip -t` سالم بود و مجوز 0600 گرفت. بازیابی کامل همین فایل هنوز آزمایش نشده است.
- پس از #75 شمار `place/section/item/variant` به‌ترتیب `376/4206/42757/114` باقی ماند؛ `booking_enabled=0` و `booking_requests=0`. نسخه‌های App/Worker یکسان و بدون restart بودند؛ خانه، کافهٔ نمونه، robots، sitemap و manifest سالم بودند. آزمون پنل احرازشدهٔ Production به علت نبود نشست QA مجاز انجام نشد.
- Fingerprint قدیمی زمان‌ها با مقدار پس از انتشار فرق داشت. بکاپ خودکار #75 را در MariaDB ایزوله به جدول‌های `place` و `menu_item` بازسازی و ردیف‌به‌ردیف مقایسه کردیم: هیچ `last_verified_at` یا `price_updated_at` تغییر نکرد؛ فقط `place.updated_at` یک کافه همراه با `rating_sum/rating_count/view_count` بعد از پایان Workflow تغییر کرده است. گارد درون Workflow قبل/بعد Migration نیز موفق بود. این تغییر محتوای طبیعی را رگرسیون انتشار نمی‌نامیم.
- پاک‌سازی فقط کشِ قابل‌بازتولید Docker قدیمی‌تر از ۷۲ ساعت انجام شد (حدود ۱٫۷ گیگابایت)؛ Imageهای زنده و Rollback دست‌نخورده‌اند.
- پس از #76 جدول‌های `venue_event`، `event_participation` و تاریخچه حاضرند و شمار رویداد/مشارکت صفر است. شمار `place/section/item/variant` همان `376/4206/42757/114`، شمار درخواست رزرو و شعبهٔ فعال صفر، و Fingerprint حساس پیش/پس از انتشار دقیقاً `8ac6edfc8451b5472ab9aa6f48529a17bdcb511b8915d51f6c43b4648d3bd775` بود. خانه، کافهٔ نمونه، رویدادهای خالی با `noindex`، robots، sitemap و manifest سالم بودند. بکاپ خودکار #76 با `gzip -t` تأیید شد و Image نسخهٔ پیشین برای بازگشت موجود ماند. آزمون احرازشدهٔ Production همچنان به دلیل نبود نشست QA مجاز انجام نشده است.
- برای مرحلهٔ اعلان/آمار، آزمون جامع ۴۷۰ Pass / صفر Fail / ۱۵ Skip داشت؛ Integration رزرو و رویداد در MariaDB ایزوله ۷ و ۵ Pass، و دو سفر HTTP/مرورگر با نشست‌های آزمایشی در دیتابیس دورریختنی Pass شدند. Build، Typecheck، Lint، بررسی Diff و اسکن Secret موفق‌اند. اجرای `db:verify` روی دیتابیس دورریختنیِ خالی ۷ کنترل محتواییِ وابسته به دادهٔ Seed را Fail کرد؛ کنترل‌های Schema و ایمنی رزرو/رویداد Pass بودند. این نتیجه را Pass کاملِ `db:verify` نمی‌نامیم؛ Workflow انتشار روی دادهٔ واقعی باید گیت خودش را مستقل بگذراند.

## قیدهای فعال

هیچ شعبه‌ای با Migration به‌صورت پیش‌فرض فعال نمی‌شود. TopMenu Apply، تغییر منو/قیمت واقعی، رویداد یا حساب آزمایشی Production انجام نشده است. دادهٔ Pilot، سیاست نگهداری اطلاعات شخصی و Opt-in واقعی شعبه هنوز نیازمند اقدام مالک/کافه‌دار هستند.
