-- آیتم‌های غیرخوراکی/خدماتی می‌توانند از محاسبهٔ سطح قیمت مکان کنار گذاشته شوند.
-- DEFAULT 0 باعث می‌شود دادهٔ موجود بدون تغییر رفتاری مهاجرت کند.
ALTER TABLE menu_item
  ADD COLUMN exclude_from_price_stats BOOLEAN NOT NULL DEFAULT FALSE AFTER price_unknown;
