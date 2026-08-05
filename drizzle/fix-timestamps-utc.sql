-- اصلاح یک‌باره‌ی تایم‌استمپ‌هایی که با منطقه‌ی زمانی اشتباه نوشته شدند.
--
-- سرور MySQL اول روی `+03:30` تنظیم شده بود، پس هر ستونی که خودش پر می‌کرد
-- (`DEFAULT CURRENT_TIMESTAMP`) وقتِ تهران را می‌نوشت، در حالی که درایور
-- (`timezone: 'Z'`) آن را UTC می‌خواند. نتیجه: همه‌ی زمان‌ها ۳ ساعت و ۳۰
-- دقیقه در آینده.
--
-- سرور حالا UTC است. این فایل داده‌ی قبلی را عقب می‌کشد.
--
-- ⚠️  فقط **یک‌بار** و فقط روی داده‌ای که قبل از اصلاح تنظیمات نوشته شده.
--     اجرای دوباره، زمان‌ها را ۳:۳۰ دیگر عقب می‌برد.
--     شرط `< '2026-08-06'` همین را محدود می‌کند: ردیف‌های بعدی دست‌نخورده
--     می‌مانند چون تاریخشان بزرگ‌تر است.

UPDATE place
SET created_at = created_at - INTERVAL 210 MINUTE,
    updated_at = updated_at - INTERVAL 210 MINUTE
WHERE created_at < '2026-08-06 00:00:00';

UPDATE media
SET created_at = created_at - INTERVAL 210 MINUTE
WHERE created_at < '2026-08-06 00:00:00';

UPDATE media
SET fetched_at = fetched_at - INTERVAL 210 MINUTE
WHERE fetched_at IS NOT NULL AND fetched_at < '2026-08-06 00:00:00';

UPDATE app_user
SET created_at = created_at - INTERVAL 210 MINUTE
WHERE created_at < '2026-08-06 00:00:00';

UPDATE app_user
SET last_login_at = last_login_at - INTERVAL 210 MINUTE
WHERE last_login_at IS NOT NULL AND last_login_at < '2026-08-06 00:00:00';

UPDATE app_user
SET password_updated_at = password_updated_at - INTERVAL 210 MINUTE
WHERE password_updated_at IS NOT NULL AND password_updated_at < '2026-08-06 00:00:00';
