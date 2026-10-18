# انتشار کنترل‌شدهٔ بازطراحی Homepage

Baseline تأییدشدهٔ شروع: `d7f470b31a010e5606d79c9cec05bfa97bc02e24`، App و Worker روی همان نسخه Healthy بودند.
Branch: `feat/home-visual-redesign-20261018`.

## شواهد پیش از انتشار

- Backup مستقل: `/var/backups/kucafe/db/manual-pre-home-visual-20261018T153351Z.sql.gz`، حدود ۱۲۹ مگابایت، غیرخالی و `gzip -t` موفق.
- آرشیو بازگشت: `/var/backups/kucafe/images/pre-home-visual-d7f470b31a01.tar`، حدود ۴۷۹ مگابایت، فهرست TAR سالم؛ شامل App و Worker همان SHA مبنا.
- Runner در بررسی پیش از انتشار Online/Idle بود؛ Deploy دیگری فعال نبود؛ Worker آخرین اجرا را Completed و بدون PID فعال گزارش می‌کرد.
- شمار داده‌ها: ۳۷۶ Place، ۴۲۰۶ Section، ۴۲۷۵۷ Item، ۱۱۴ Variant. Fingerprint زمان‌های Place: `2923660768`؛ قیمت و زمان قیمت Item: `2436009399`.

این اعتبارسنجی Backup شامل ساخت و خواندن ساختار فشرده است؛ ادعای Restore جدید روی دیتابیس زنده یا تست نوشتن روی دادهٔ واقعی وجود ندارد.

## دامنه

یک PR برای چهار خانوادهٔ کارت، Assetهای اختصاصی Homepage، رنگ Header همان صفحه و CTA نصب در Footer مشترک. هیچ Migration، Dependency تازه، تغییر منو، ثبت نظر/رزرو آزمایشی یا TopMenu Apply در این تغییر وجود ندارد.

## Gate انتشار

1. موفقیت CI روی Head نهایی، شامل MariaDB Disposable، Authorization، Booking، Events، Export، TopMenu Protection، Timestamp و Approved Reviews.
2. Build و مرورگر واقعی مطابق [گزارش QA](HOME_VISUAL_QA_FA.md)، بازبینی تصاویر و Diff، و `git diff --check`.
3. بررسی مجدد SHA واقعی Production، سلامت App/Worker، دیسک، Runner و نبود Deploy یا TopMenu Apply هم‌زمان.
4. Backup تازه با Runbook موجود؛ فایل غیرخالی و `gzip -t`، حفظ Imageهای سازگار App و Worker.
5. فقط Merge همین PR؛ رصد `Deploy production` تا پایان واقعی، بدون Deploy یا Migration دستی موازی.
6. Runtime و Image جدید، HTTP/مرورگر، CSS/JS/تصاویر، مسیرهای اصلی، Manifest و Fingerprint داده‌ها پس از انتشار بررسی شوند.

## بازگشت

نسخهٔ سالم پیش از Merge و Imageهای App/Worker آن ثبت و حفظ می‌شوند. در شکست بحرانی، هر دو سرویس طبق `scripts/docker-deploy.sh` و Runbook Docker به همان نسخهٔ سازگار بازگردند. برای تغییر UI، دیتابیس Restore یا ستون‌ها حذف نشوند. در صورت نیاز به هماهنگ‌کردن GitHub با Runtime، Revert همین تغییر با بررسی مستقل انجام شود.

نتیجهٔ واقعی Merge، URL اجرای Workflow، SHA Runtime و Acceptance پس از اتمام در گزارش تحویل و شواهد همان PR ثبت می‌شود؛ موفقیت Merge به‌تنهایی پذیرش Runtime محسوب نمی‌شود.

## انتشار اصلی و اصلاح تکمیلی Rail

PR [#87](https://github.com/Rezz0722/cafe/pull/87) با Commit `a76984d68170fb0f7dad52716b3d9bde8bceed8e` منتشر شد. [Workflow](https://github.com/Rezz0722/cafe/actions/runs/39142605035) موفق بود؛ App/Worker روی همان SHA و Healthy، بدون Restart بودند. شمار رکوردها و هر دو Fingerprint بالا حفظ شدند. QA مرورگر Production در ۱۲ حالت موفق شد.

اندازه‌گیری واقعی پس از انتشار، ضعف نشانهٔ Swipe را مشخص کرد: در ۳۲۰ و ۳۶۰ پیکسل کارت سوم دیده نمی‌شد و در ۳۹۰ فقط ۲٪ آن پیدا بود. Branch `fix/home-experience-rail-peek-20261018` روی همین Production ساخته شد تا عرض کارت موبایل و Alt متناظر تصاویر نمادین را اصلاح کند. گیت جدید، دیده‌شدن بخشی معنادار از کارت دوم را با هندسهٔ واقعی مرورگر می‌سنجد. تغییر Backend یا Schema وجود ندارد.

انتشار این اصلاح فقط پس از CI و QA همان Head و پایان انتشار اصلی انجام می‌شود؛ Image سالم `sha-a76984d68170` نقطهٔ بازگشت مرحلهٔ دوم است.
