-- ایندکس‌هایی که drizzle-kit تولید نمی‌کند.
-- بعد از هر `npm run db:push` یا اجرای مهاجرت، این فایل را اجرا کنید:
--   npm run db:extras
--
-- چرا FULLTEXT و نه LIKE: جست‌وجوی «کجا کروسان داره» باید در ۱۹٬۳۸۶ آیتم
-- منو بگردد. `LIKE '%کروسان%'` هیچ ایندکسی نمی‌تواند استفاده کند و کل جدول
-- را می‌خواند. MySQL 8 با parser پیش‌فرض روی فارسی کار می‌کند چون فارسی
-- فاصله‌محور است (برخلاف چینی/ژاپنی که به ngram parser نیاز دارند).

-- جست‌وجوی نام کافه
ALTER TABLE place ADD FULLTEXT INDEX place_name_ft (name, name_normalized);

-- جست‌وجوی آزاد در منو
ALTER TABLE menu_item ADD FULLTEXT INDEX menu_item_name_ft (name, name_normalized);

-- جست‌وجو در متن نظرها (پنل ادمین: پیدا کردن نظرهای مسئله‌دار)
ALTER TABLE review ADD FULLTEXT INDEX review_text_ft (text);
