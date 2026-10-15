# KuCafe P1-04 — ممیزی مجوز شعبه و نقش

تاریخ: ۱۴۰۵/۰۷/۲۳ (۲۰۲۶-۱۰-۱۵). مبنا: شاخه `production` در `3129766`، بدون تغییر Production.

## ماتریس مجوز واقعی

| عملیات | Admin | Owner شعبه | Manager شعبه | Staff | View-as |
|---|---|---|---|---|---|
| خواندن منوی عمومی | بله | بله | بله | بله | بله |
| ویرایش منو، قیمت، تصویر، اطلاعات شعبه و پاسخ نظر | همه شعب | شعبه خود | شعبه خود | خیر | خیر |
| Import منو، QR و آمار منو | همه شعب | شعبه خود | شعبه خود | خیر | خیر |
| Export کامل CSV/JSON، شامل آرشیو | همه شعب | شعبه خود | خیر | خیر | خیر |
| کاربران شعبه، باشگاه و کمپین | همه شعب | شعبه خود | خیر | خیر | خیر |
| عملیات سراسری ادمین، TopMenu و بررسی لیدها | بله | خیر | خیر | خیر | خیر |

تمام مجوزهای شعبه به انتساب فعال همان `placeId` وابسته‌اند. نقش سراسری `owner` به‌تنهایی برای هیچ شعبه‌ای کافی نیست. View-as فقط برای مشاهده است و به هیچ درخواست نوشتن یا Export خصوصی مجوز نمی‌دهد. نقش `staff` در این فاز قابلیت تازه‌ای نگرفت.

## موجودی مسیرهای حساس و گارد سمت سرور

- `src/app/admin/venue/actions.ts`: اکشن‌های اطلاعات، ساعات، ویژگی‌ها، تصاویر، دسته و آیتم منو، قیمت/سایز، جابه‌جایی و آرشیو، Import، QR، پاسخ نظر، نقش‌ها و باشگاه؛ `authorizeVenueSession` شناسه شعبه، وضعیت زنده حساب، انتساب فعال و View-as را بررسی می‌کند. اکشن‌های مربوط به آیتم/سایز/نظر ابتدا `placeId` واقعی رکورد را می‌خوانند. اعطای نقش و باشگاه افزون بر آن Owner/Admin می‌خواهند.
- `src/core/import/venueMenuImport.ts`، `src/core/qr/channels.ts` و `src/core/analytics/menuStats.ts`: سرویس‌های مستقیم نیز به‌طور مستقل همان مجوز فعال را بررسی می‌کنند، نه فقط اکشن فراخوان.
- `src/app/api/admin/venue/menu-export/route.ts`: CSV/JSON با `requireAdminRead(placeId, true)`، Snapshot همان شعبه، هدر خصوصی و `no-store`؛ Manager، Staff، نقش لغوشده و View-as رد می‌شوند.
- `src/app/api/admin/venue/category-artwork/route.ts`، `src/app/api/admin/history/route.ts`: خواندن محدود به شعبه مجاز. `src/app/api/admin/club/route.ts`: Owner/Admin همان شعبه.
- `src/app/admin/actions.ts`، `src/app/admin/experiences/actions.ts`، `src/app/admin/leads/actions.ts` و APIهای admin catalog/search-insights/TopMenu: Admin واقعی، فعال، خارج از View-as و بدون الزام تغییر رمز موقت. اکشن‌های Experience/Lead از گارد مشترک استفاده می‌کنند.
- `src/app/profile/actions.ts`: عملیات شخصی کاربر با هویت نشست واقعی؛ ثبت درخواست مالکیت در `src/app/profile/venue-requests/actions.ts` به معنی اعطای دسترسی نیست و بررسی انسانی دارد.

## نقص‌های تأییدشده و اصلاح

1. `canWritePlace` پیش‌تر هر انتساب غیر-null را مجوز نوشتن می‌دانست؛ بنابراین Staff می‌توانست اکشن‌های مدیریت را مستقیم فراخوانی کند. اکنون فقط Admin یا Owner سراسری با انتساب فعال Owner/Manager مجاز است. همین محدودیت در QR، Import و آمار نیز اعمال شد.
2. `loadOwnedPlaces`، Staff را در فهرست شعب قابل‌مدیریت نشان می‌داد؛ اکنون فقط Owner/Manager را برمی‌گرداند. این تغییر مانع نمایش اطلاعات خصوصی پنل به Staff می‌شود.
3. `canManagePlaceUsers` در حالت ناسازگار «نقش سراسری customer با انتساب owner» صرفاً انتساب را می‌دید؛ اکنون هر دو نقش باید معتبر باشند.
4. اکشن Experience بررسی مستقیم `mustChangePassword` نداشت. اکشن Lead همان نقص را در لایه اکشن داشت، هرچند سرویس Lead قبلاً آن را رد می‌کرد. هر دو اکنون گارد مشترک Admin دارند.

بازآفرینی سیستم نقش‌ها، تغییر Schema، Migration و UI جدید انجام نشد.

## شواهد QA و محدودیت‌ها

- تست MariaDB ایزوله با نشست امضاشده واقعی: مجازبودن Admin/Owner/Manager، رد شعبه بیگانه و `placeId` دستکاری‌شده، Staff، نقش لغوشده، حساب مسدود، رمز موقت، نشست منقضی و View-as.
- Export JSON/CSV در MariaDB ایزوله و از HTTP واقعی سرور Next آزمایشی: مجوز Owner/Admin، رد Manager/Staff/بیگانه/نقش لغوشده/View-as، جداسازی داده دو شعبه، هدر خصوصی و BOM واقعی CSV. تست HTTP جداگانه در CI پس از Build نیز اجرا می‌شود.
- تست Microsoft Excel دسکتاپ **انجام نشده** و Gate تحویل پایلوت باقی است.
- Smoke احرازشده Production **انجام نشده** چون نشست آزمایشی از پیش مجاز در دسترس نبود. Smoke عمومی و پاسخ 401 بدون نشست فقط خواندنی است.
- Build با `NEXT_DIST_DIR=.next-p1-04-qa` جدا از `.next` فعال اجرا شد؛ هیچ Migration یا Apply روی Production انجام نشد.

نتیجه محلی: ۴۵۹ تست واحد/عمومی Pass، ۸ Skip، صفر Fail؛ تست جدید MariaDB با ۶ Pass؛ تست HTTP واقعی با ۱ Pass؛ Typecheck و Build ایزوله Pass. وضعیت CI در PR ثبت می‌شود. Merge، Deploy و TopMenu Apply به مجوز جداگانه مالک نیاز دارند.
