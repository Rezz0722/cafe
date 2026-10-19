# انتشار ترتیبی اصلاح تجربهٔ عمومی

## مبنا و پیش‌پرواز

مبنای تأییدشدهٔ GitHub، `current-revision` و Label هر دو Image در ۱۹ اکتبر ۲۰۲۶:
`502614abd2e28484ae775a16cfda982c15974c3c`.

App و Worker هر دو Healthy، صفر restart، دیتابیس در `db:verify` سالم، Runner بیکار و قفل‌های انتشار آزاد بودند. آخرین TopMenu job تمام‌شده متعلق به ۱۱ اکتبر بود؛ Apply تازه اجرا نشده است.

- Backup تازه: `/var/backups/kucafe/db/manual-pre-public-discovery-20261019T1233Z.sql.gz`، ۱۲۹MiB، `gzip -t` و خواندن ساختار SQL موفق؛ SHA-256: `3c5a0de00f8237ce29d3a7859ff25603200ca8de3f59f491c63118fd1bee41d5`. بازیابی کامل این فایل در این مأموریت اجرا نشده است.
- Imageهای App/Worker مبنا در `/var/backups/kucafe/images/pre-public-discovery-502614abd2e2-20261019.tar.gz` ذخیره شدند؛ آزمون gzip و خواندن manifest/tar موفق؛ SHA-256: `7896fcec5346347b35bff4340147874a493c994631b97a699bd1649219be371c`.
- فقط cache بازتولیدپذیر و استفاده‌نشدهٔ Docker قدیمی‌تر از ۱۲ ساعت پاک شد؛ ۵٫۷۹GB آزاد شد و فضای آزاد به ۱۱GB رسید. Image زنده، rollback، volume و backup حذف نشدند.
- snapshot فقط‌خواندنی در تراکنش read-only، شمار و SHA-256 جدول‌های پایه، قیمت/زمان، نقش، QR، وضعیت رزرو/رویداد و schema/index/migration را ثبت می‌کند. قبل از Merge اول دوباره برابر بود: ۳۷۶ مجموعه، ۴٬۲۰۶ دسته، ۴۲٬۷۵۷ آیتم و ۱۱۴ تنوع.

## واحدهای انتشار

| ترتیب | PR | Gate |
|---|---|---|
| ۱ | [#89](https://github.com/Rezz0722/cafe/pull/89) | نظرات عمومی، privacy/moderation، صفحه‌بندی، active نقشه؛ Head `6f3055b74329bedcd70ac5eaabdf418b242c8b7b`؛ [CI](https://github.com/Rezz0722/cafe/actions/runs/39253682117) |
| ۲ | [#91](https://github.com/Rezz0722/cafe/pull/91) | فقط پس از پذیرش Runtime مرحلهٔ اول؛ دسته‌های غذا و حذف مقایسهٔ عمومی؛ هماهنگ با production و [CI](https://github.com/Rezz0722/cafe/actions/runs/39254570184) |
| ۳ | [#90](https://github.com/Rezz0722/cafe/pull/90) | فقط پس از مرحلهٔ دوم؛ تجربه/محله، integration رتبه‌بندی/صفحه‌بندی و مستندات/تصاویر |
| ۴ | [#92](https://github.com/Rezz0722/cafe/pull/92) | فقط پس از مرحلهٔ سوم؛ نمایش منو/Search، empty state، فرم مالک و ناوبری اسناد |

Merge مرحلهٔ اول: `7353b026a19ddd6ffe4aa5f0857acce62b810ff2`؛ [Workflow استاندارد](https://github.com/Rezz0722/cafe/actions/runs/39254417021). هنگام ثبت اولیهٔ این سند، Workflow در حال اجرا بود؛ Merge به‌تنهایی پذیرش نیست. اتصال Broker Runner یک Timeout داشت؛ پس از تأیید نبود Worker/Deploy فعال و آزادبودن قفل‌ها، فقط سرویس Runner بیکار restart شد و همان Workflow ادامه یافت. Workflow موازی ساخته نشد.

SHAها و شواهد واقعی مراحل بعد، وضعیت نهایی و لینک نتایج smoke در نظرات پذیرش همین PRها ثبت می‌شوند؛ این سند از پیش نتیجهٔ آینده را Success اعلام نمی‌کند. مستندسازی نهایی با بستهٔ آخر همراه می‌شود، نه Deploy جدا صرفاً برای گزارش.

## پذیرش هر مرحله

۱. Head/Base/CI دقیق و Diff محدود؛ Runtime سالم مرحلهٔ قبل و Image همان نسخه؛ نبود deploy/apply موازی.
۲. Merge فقط همان PR و نظارت Workflow خودکار موجود. Workflow خودش backup، migrationهای موجود و idempotent، `db:verify` و گارد timestamp قبل/بعد را اجرا می‌کند؛ هیچ Migration جدید یا دستی در این مأموریت نیست.
۳. برابرشدن GitHub و Runtime SHA؛ Healthy بودن **هر دو** کانتینر و نبود restart/خطای بحرانی جدید.
۴. `public-ux-release-smoke.ts` روی نسخهٔ زنده، خواندن CSS/JS دارای fingerprint و مسیرهای مرتبط در هر دو تم؛ snapshot داده/schema پیش و پس از انتشار.
۵. تنها پس از موفقیت این موارد Merge بعدی مجاز است. CI یا HTTP 200 به‌تنهایی کافی نیست.

## بازیابی

Runtime با Imageهای سازگار App و Worker **آخرین مرحلهٔ سالم** و Compose موجود برمی‌گردد؛ نه PM2/مسیر انتشار موازی. پس از کنترل health و smoke، GitHub با Revert کنترل‌شدهٔ تغییر معیوب هماهنگ می‌شود تا deploy بعدی آن را بازنشر نکند. برای وابستگی‌ها ترتیب معکوس رعایت می‌شود. هیچ rollback دیتابیس، حذف ستون یا بازیابی کورکورانهٔ backup برای اصلاح UI مجاز نیست. اختلاف snapshot ابتدا با write طبیعی کاربر/گزارش audit بررسی می‌شود.

## محدودیت‌های عملیاتی

AUTHENTICATED PRODUCTION QA: NOT TESTED. نشست آزمایشی مجاز موجود نیست و حساب تازه ساخته نشده است. QR فعال/رزرو/نظر یا رویداد آزمایشی تولیدی ایجاد نمی‌شود. رگرسیون‌های امضاشده و MariaDB جداگانه در CI موفق‌اند اما به‌عنوان اثبات Login عملیاتی معرفی نمی‌شوند. نصب واقعی PWA/Excel/QR چاپی نیازمند دستگاه و پایلوت است.

TOPMENU APPLY: NOT EXECUTED. تغییر schema، قیمت واقعی، منو، حساب و دادهٔ محصول توسط این مأموریت: NOT EXECUTED.
