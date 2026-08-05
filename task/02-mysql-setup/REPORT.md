# تسک ۰۲ — راه‌اندازی MySQL و مهاجرت شما ✅

## چه چیزی انجام شد

پروژه کاملاً از Postgres به **MySQL 8.4.11 LTS** منتقل شد: سرور نصب و
راه‌اندازی شد، شمای کامل (۳۷ جدول) بازنویسی و اعمال شد، لایه‌ی اتصال ساخته شد
و با دود-تست روی داده‌ی واقعیِ فارسی تأیید شد.

## سرور MySQL

| مورد | مقدار |
| --- | --- |
| نسخه | MySQL 8.4.11 (LTS) |
| مسیر باینری | `C:\mysql\mysql-8.4.11-winx64\bin` |
| مسیر داده | `C:\mysql-data` |
| فایل تنظیمات | `C:\mysql\my.ini` |
| نشانی | `127.0.0.1:3306` (فقط لوکال) |
| دیتابیس | `cafegard` — `utf8mb4` / `utf8mb4_unicode_ci` |
| کاربر اپ | `cafegard` |
| منطقه‌ی زمانی سرور | `+03:30` |

نصب از آرشیو zip انجام شد نه installer، پس **سرویس ویندوز ثبت نشده و با
ری‌استارت ماشین بالا نمی‌آید**. برای همین `scripts/mysql-service.ps1` اضافه
شد:

```powershell
powershell -File scripts/mysql-service.ps1 start    # بالا آوردن
powershell -File scripts/mysql-service.ps1 status   # وضعیت + نسخه
powershell -File scripts/mysql-service.ps1 stop     # خاموشی تمیز
```

توقف از `mysqladmin shutdown` استفاده می‌کند نه kill — kill کردن مستقیم
InnoDB را نیازمند recovery می‌کند.

## شما — ۳۷ جدول در ۷ گروه

| گروه | جدول‌ها |
| --- | --- |
| واژگان | `district` `facet` `attribute` `dish` `dish_alias` |
| رسانه | `media` |
| مکان | `place` `place_phone` `place_social` `place_hours` `place_hours_exception` `place_attribute` `place_facet` `place_dish` `place_photo` |
| منو | `menu_section` `menu_item` |
| کاربر | `app_user` `user_place_role` `user_taste_profile` `user_preference` `saved_place` `auth_session` `otp_code` |
| مشارکت | `review` `review_photo` `review_vote` `review_reply` `place_submission` `edit_suggestion` `place_claim` |
| عملیات | `audit_log` `impersonation_log` `search_log` `page_view` `daily_stat` `setting` |

## تصمیم‌های طراحی و دلیلشان

**۱. `DECIMAL(10,7)` برای مختصات، نه `POINT` با ایندکس فضایی.**
MySQL 8 نوع `POINT` و `SPATIAL INDEX` دارد، ولی برای ۳۳۱ مکان یک ایندکس
فضایی سود قابل‌اندازه‌گیری ندارد و در عوض یک لایه پیچیدگی اضافه می‌کند
(SRID، ترتیب lat/lng که در MySQL برعکسِ انتظار است). فیلتر کادر روی دو ستون
ایندکس‌شده + هاورساین در اپ، هم ساده‌تر است و هم قابل تست.
درایور `DECIMAL` را **رشته** برمی‌گرداند و عمداً همین‌طور نگه داشته شد؛
تبدیل خودکار به float رقم هفتم اعشار را بی‌صدا خراب می‌کند.

**۲. `utf8mb4` اجباری، نه سلیقه‌ای.** داده‌ی واقعی ایموجی دارد
(«وسترن🌶️» نام یک آیتم منو است). `utf8` سه‌بایتیِ MySQL این را با خطای
`Incorrect string value` رد می‌کند یا بی‌صدا می‌برد.

**۳. شناسه‌ها: `AUTO_INCREMENT` برای همه، `CHAR(36)` UUID فقط برای
`app_user`.** UUID در کوکی نشست ظاهر می‌شود و نباید تعداد کاربران را لو
بدهد. برای `place` و `menu_item` که در join سنگین شرکت می‌کنند، عدد صحیح
هم کم‌حجم‌تر است و هم ایندکسش خوشه‌ای می‌ماند.

**۴. `place_hours` کلید سه‌ستونی.** یافته‌ی تسک ۰۱: شیفت شکسته.
کلید `(place_id, dow, shift_index)`.

**۵. `menu_item.place_id` عمداً denormalize شد.** با اینکه از
`section_id` قابل استنتاج است، هر پرس‌وجوی «آیتم‌های این کافه» و هر فیلتر
قیمت در سطح کافه یک join کمتر می‌خورد. روی ۱۹٬۳۸۶ ردیف این تفاوت دیده
می‌شود.

**۶. `place_facet` و `place_dish` رول‌آپ‌های محاسبه‌شده‌اند.** فیلتر
«کافه‌هایی که پاستا دارند» بدون این‌ها باید با ۱۹٬۳۸۶ آیتم join و group
بشود. رول‌آپ در زمان ایمپورت پر می‌شود.

**۷. `facet` از `attribute` جدا ماند.** facet از منوی واقعی استخراج
می‌شود و اثبات‌پذیر است («۱۲ آیتم پاستا دارد»)؛ attribute قضاوت است
(«دنج است»). یکی‌کردنشان یعنی این دو یک اعتبار داشته باشند، که ندارند.

**۸. `media` رجیستری دانلود است، نه فقط جدول URL.** ستون‌های `status`،
`attempts`، `content_hash` دانلود ۱۴٬۵۵۸ تصویر را **قابل ازسرگیری** و
بدون تکرار فایل می‌کنند. بدون این‌ها، هر قطعی شبکه یعنی شروع از صفر.

## ایندکس‌های FULLTEXT

`drizzle-kit` ایندکس FULLTEXT تولید نمی‌کند، پس در فایل جدا آمد و با
`npm run db:extras` اعمال می‌شود (idempotent — اجرای دوباره بی‌خطر):

| جدول | ایندکس | برای |
| --- | --- | --- |
| `place` | `place_name_ft (name, name_normalized)` | جست‌وجوی نام کافه |
| `menu_item` | `menu_item_name_ft (name, name_normalized)` | «کجا کروسان داره» در ۱۹هزار آیتم |
| `review` | `review_text_ft (text)` | پیدا کردن نظرهای مسئله‌دار در پنل ادمین |

`LIKE '%…%'` هیچ ایندکسی نمی‌تواند استفاده کند و کل جدول را می‌خواند.

## لایه‌ی اتصال

```
src/db/connection.ts   استخر mysql2 + drizzle — بدون server-only
src/db/client.ts       همان، با گاردِ server-only  ← کدِ اپ از این استفاده می‌کند
```

دو فایل، چون `server-only` در اجرای مستقیم Node می‌ترکد و اسکریپت‌های CLI
(ایمپورت، دانلود تصویر) به همان استخر نیاز دارند. استخر روی `globalThis`
کش می‌شود؛ بدون آن، hot-reloadهای Next در توسعه استخر روی استخر باز می‌کنند
تا MySQL با `ER_CON_COUNT_ERROR` جواب بدهد.

## چطور تست شد

`npm run db:smoke` — ۹ بررسی، همه موفق:

```
✓ درج و خواندن مکان
✓ فارسی و ایموجی سالم — کافه‌ی آزمایشی ☕
✓ نیم‌فاصله سالم
✓ دقت DECIMAL مختصات — 36.3490596, 59.4297133
✓ ایموجی در نام آیتم — وسترن🌶️ تست
✓ قیمت نامعلوم NULL می‌ماند (نه صفر)
✓ جست‌وجوی FULLTEXT فارسی — ۱ نتیجه
✓ URL بلند CDN (۷۰۰ کاراکتر) جا می‌شود
✓ حذف آبشاری منو با حذف مکان
```

هر بررسی یک ریسک واقعی را می‌بندد، نه اینکه «چیزی کار می‌کند» را نشان بدهد.

## فایل‌ها

**جدید**
- `src/db/connection.ts` · `src/db/client.ts`
- `scripts/db-smoke.ts` · `scripts/run-sql.mjs` · `scripts/mysql-service.ps1`
- `drizzle/mysql-extras.sql`
- `C:\mysql\my.ini` (بیرون مخزن)

**بازنویسی‌شده**
- `src/db/schema.ts` — کل شما از pg-core به mysql-core
- `drizzle.config.ts` — dialect: mysql
- `src/core/config/env.ts` — `DATABASE_URL` اضافه شد
- `package.json` — `postgres` حذف، `mysql2` اضافه، اسکریپت‌های `db:*`
- `.env.local` — `DATABASE_URL`

## کارِ باقی‌مانده

- `src/core/places/repository.ts` هنوز از فایل JSON می‌خواند. آداپتور MySQL
  در تسک ۰۴ نوشته می‌شود — بعد از اینکه داده‌ی واقعی داخل دیتابیس باشد،
  چون نوشتن آداپتور روی جدول خالی قابل تست نیست.
- برای تولید: رمز `cafegard_local_2026` فقط برای لوکال است و باید عوض شود.
