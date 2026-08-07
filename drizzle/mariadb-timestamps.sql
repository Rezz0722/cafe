-- ═══════════════════════════════════════════════════════════════════════
--  اصلاح تایم‌استمپ‌های nullable روی MariaDB
--
--  فقط روی MariaDB لازم است. روی MySQL 8 اجرایش بی‌خطر ولی بی‌اثر است.
--
--  ═══ مسئله ═══
--
--  MySQL 8 پیش‌فرض `explicit_defaults_for_timestamp = ON` دارد؛ **MariaDB
--  10.6 آن را OFF دارد**. با OFF، رفتار قدیمیِ TIMESTAMP فعال است:
--
--    • ستون `TIMESTAMP` که در DDL صریحاً `NULL` نشده باشد، `NOT NULL` می‌شود
--    • و پیش‌فرضش `'0000-00-00 00:00:00'` می‌شود
--
--  drizzle این ستون‌ها را nullable تعریف کرده (`timestamp('last_login_at')`
--  بدون `.notNull()`) ولی SQL تولیدی‌اش `NULL` را صریح نمی‌نویسد، پس MariaDB
--  آن‌ها را `NOT NULL DEFAULT '0000-00-00'` می‌سازد.
--
--  ═══ چرا این یک باگ واقعیِ تولید است ═══
--
--  ردیف تازه‌ی `app_user` مقداری برای `last_login_at` نمی‌گیرد، پس صفر-تاریخ
--  می‌شود. درایور آن را به `Invalid Date` تبدیل می‌کند و `toRecord` در
--  `userRepo.ts` روی `.toISOString()` می‌ترکد:
--
--      RangeError: Invalid time value
--
--  یعنی **ساختِ هر کاربر جدید** — چه ثبت‌نام با پیامک، چه ساختِ حساب
--  کافه‌دار از پنل ادمین — با خطا می‌افتاد. روی سرور تولید همین اتفاق افتاد و
--  در `auth:smoke` و `admin:smoke` گرفته شد.
--
--  ═══ چرا `explicit_defaults_for_timestamp = ON` کافی نیست ═══
--
--  آن تنظیم فقط روی **ساختِ** جدول اثر دارد، نه روی جدول‌های موجود. و
--  تغییرش در `my.cnf` سراسری است؛ روی سروری که دیتابیس‌های دیگری هم دارد
--  (میل‌سرور، سایت‌های دیگر) تغییرِ سراسری برای رفع مسئله‌ی یک اپ درست نیست.
--
--  پس ستون‌ها صریحاً به همان چیزی که schema می‌گوید برگردانده می‌شوند.
--
--  ═══ اجرا ═══
--
--    npm run db:mariadb-fix
--
--  بی‌خطر برای اجرای دوباره: `MODIFY` به همان حالت، بی‌اثر است.
-- ═══════════════════════════════════════════════════════════════════════

-- ── app_user ──
-- `last_login_at` تا اولین ورود خالی است، `locked_until` تا اولین قفل.
ALTER TABLE app_user MODIFY last_login_at       timestamp NULL DEFAULT NULL;
ALTER TABLE app_user MODIFY locked_until        timestamp NULL DEFAULT NULL;

-- ── auth_session ──
-- ⚠️ `expires_at` عمداً دست‌نخورده می‌ماند: در schema `.notNull()` است و
--    باید بماند — نشستِ بی‌انقضا یعنی نشستِ ابدی.
ALTER TABLE auth_session MODIFY revoked_at      timestamp NULL DEFAULT NULL;

-- ── impersonation_log ──
-- تا وقتی ادمین از حالت «مشاهده به‌عنوان» بیرون نیامده، خالی است.
ALTER TABLE impersonation_log MODIFY ended_at   timestamp NULL DEFAULT NULL;

-- ── media ──
-- تا دانلود موفق، خالی است. ردیفِ `pending` نباید صفر-تاریخ داشته باشد.
ALTER TABLE media MODIFY fetched_at             timestamp NULL DEFAULT NULL;

-- ── otp_code ──
-- تا مصرف‌شدنِ کد، خالی است.
ALTER TABLE otp_code MODIFY consumed_at         timestamp NULL DEFAULT NULL;

-- ── پاک‌سازیِ داده‌ی موجود ──
-- ردیف‌هایی که قبل از این اصلاح ساخته شده‌اند و صفر-تاریخ گرفته‌اند.
UPDATE app_user          SET last_login_at = NULL WHERE CAST(last_login_at AS CHAR) LIKE '0000-00-00%';
UPDATE app_user          SET locked_until  = NULL WHERE CAST(locked_until  AS CHAR) LIKE '0000-00-00%';
UPDATE auth_session      SET revoked_at    = NULL WHERE CAST(revoked_at    AS CHAR) LIKE '0000-00-00%';
UPDATE impersonation_log SET ended_at      = NULL WHERE CAST(ended_at      AS CHAR) LIKE '0000-00-00%';
UPDATE media             SET fetched_at    = NULL WHERE CAST(fetched_at    AS CHAR) LIKE '0000-00-00%';
UPDATE otp_code          SET consumed_at   = NULL WHERE CAST(consumed_at   AS CHAR) LIKE '0000-00-00%';
