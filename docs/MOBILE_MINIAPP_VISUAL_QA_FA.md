# QA بصری و تعاملی Mobile Mini App

تاریخ اجرا: ۱۷ اکتبر ۲۰۲۶. آزمون مرورگر روی Chromium Headless و خروجی ایزولهٔ Production Build انجام شده است؛ آزمون Safari/iOS و دو گوشی فیزیکی در این مرحله انجام نشده و نباید Pass فرض شود.

## شواهد قبل و بعد

Screenshotهای قبل در `var/qa/mobile-cafe-before-*` و `var/qa/desktop-cafe-before-*` هستند. Screenshotهای بعد در `var/qa/mobile-miniapp/` قرار دارند. این فایل‌ها در بستهٔ QA دانلودی تحویل می‌شوند و به مخزن عمومی اضافه نمی‌شوند.

| نما | قبل | بعد |
| --- | --- | --- |
| صفحهٔ اصلی ۳۹۰px | `mobile-home-before-390.png` | `mobile-home-after-production-390-light.png` |
| خلاصهٔ کافه ۳۹۰px | `mobile-cafe-before-raam-390-light.png` | `mobile-miniapp/overview-390-light.png` |
| منو ۳۹۰px تیره | `mobile-cafe-before-menu-390-dark.png` | `mobile-miniapp/menu-390-dark.png` |
| تجربه‌ها | `mobile-cafe-before-reviews-390-dark.png` | `mobile-miniapp/reviews-390-dark.png` و `reviews-with-content-390-light.png` |
| اطلاعات | صفحهٔ بلند قبلی | `mobile-miniapp/info-390-light.png` و `info-390-dark.png` |
| مقایسهٔ قیمت | `mobile-cafe-before-compare-390-dark.png` | `mobile-miniapp/compare-390-light.png` |
| دسکتاپ | `desktop-cafe-before-raam-1440-dark.png` | `mobile-miniapp/overview-1440-dark.png` |

## نتایج مرورگر

اسکریپت Read-only `scripts/mobile-miniapp-ui-smoke.ts` روی عرض‌های ۳۲۰×۵۶۸، ۳۶۰×۸۰۰، ۳۹۰×۸۴۴، ۴۳۰×۹۳۲، ۷۶۸×۱۰۲۴ و ۱۴۴۰×۹۰۰، در Light و Dark، ۶۲ کنترل را با موفقیت گذراند. کنترل‌ها شامل نبود overflow افقی، چهار مقصد، منوی یک‌لمسی بدون Fullscreen دوم، لینک مستقیم قدیمی، Refresh، Back/Forward، جست‌وجو و دستهٔ منو، بازگشت از جزئیات آیتم، Empty State تجربه‌ها، کافه دارای تجربه، مقایسهٔ قیمت و نمایش منو/نظر بدون JavaScript بودند. درخواست‌های Analytics در این مرورگر QA با پاسخ محلی ۲۰۴ قطع شدند.

تست Browser احرازشده روی MariaDB Disposable، وجود CTA رزرو فقط برای شعبهٔ Opt-in، رفتن به فرم درخواست، Browser Back، بازکردن و بستن Composer تجربه، و مسیر کامل Booking را بدون درخواست واقعی Production تأیید کرد. تست جداگانهٔ Events نیز در محیط Disposable موفق شد.

## یافته‌های بصری و اصلاح‌ها

- در ۳۹۰px، منو و مسیریابی در ردیف اصلی، تماس/ذخیره/اشتراک/باشگاه در ردیف ثانویه و خلاصهٔ قیمت در First Fold قابل استفاده‌اند. در ۳۲۰px اسکرول محدود برای ادامهٔ اطلاعات طبیعی است.
- منو پیش‌تر هنگام لمس تب، ابتدا انتخاب دستهٔ تمام‌صفحه را باز می‌کرد. اکنون آیتم‌های دستهٔ اول در همان لمس دیده می‌شوند و انتخاب دسته در هدر منو باقی مانده است.
- Empty State تجربه‌ها اکنون یک کارت و یک CTA دارد؛ کارت دوم «نظرت را بنویس» حذف شده است.
- رنگ‌های کافه، حالت تیره و Dialog مقایسه با Tokenهای KuCafe هماهنگ شده‌اند. Loading نمایشی ۲٫۴ثانیه‌ای مقایسه حذف شده است.
- برای شعبهٔ فاقد مختصات، پیام بلند در کنار Action اصلی منو باعث ستون باریک و نامناسب می‌شد. پیام فقدان موقعیت در Screen اطلاعات/نقشه باقی مانده و در خلاصه Action فاقد عملکرد نمایش داده نمی‌شود.
- در عرض ۳۲۰px چهار Action ثانویه در یک ردیف باقی می‌مانند؛ Label باشگاه برای عرض کم چندخطی است ولی برش افقی ندارد.

## محدودیت‌های صادقانه

گوشی فیزیکی iOS/Android، VoiceOver/TalkBack، مقایسهٔ رنگ با ابزار سنجش WCAG، و Screenshot از شعبهٔ واقعی دارای رزرو فعال انجام نشده است. برای رزرو فعال از Fixture ایزوله استفاده شد. آزمون Production احرازشده با حساب واقعی در این QA انجام نشده است. HTML اولیه و حالت بدون JavaScript بررسی شد؛ این نتیجه به معنی ایندکس Google نیست.
