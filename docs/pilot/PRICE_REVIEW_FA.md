# بررسی خواندنی قیمت‌های غیرمعمول

گزارش P1 به **۱۴ آیتم فعال با قیمت مثبت زیر ۱۰۰۰ تومان** اشاره کرد؛ این عدد Snapshot است و ممکن است تغییر کرده باشد. ستون `menu_item.price` و `menu_item_variant.price` طبق قرارداد Schema **تومان** هستند. پایین بودن عدد به‌تنهایی خطا را ثابت نمی‌کند؛ `0` و `NULL` را از محدودهٔ این بازبینی حذف کنید.

روش فقط‌خواندنی برای اجرای مجاز توسط مسئول فنی (خروجی خام خصوصی بماند):

```sql
SELECT mi.id, p.slug, ms.name AS section_name, mi.name AS item_name,
       mi.price AS item_price_toman, COUNT(v.id) AS variant_count,
       MIN(CASE WHEN v.available = 1 THEN v.price END) AS min_available_variant_toman
FROM menu_item mi
JOIN place p ON p.id = mi.place_id
JOIN menu_section ms ON ms.id = mi.section_id
LEFT JOIN menu_item_variant v ON v.item_id = mi.id
WHERE mi.available = 1 AND mi.archived_at IS NULL
  AND ms.branch_scope IN ('shared', 'branch')
  AND mi.price BETWEEN 1 AND 999
GROUP BY mi.id, p.slug, ms.name, mi.name, mi.price
ORDER BY p.slug, mi.id;
```

برای آیتم دارای Variant، قیمت پایه ممکن است از سایزهای موجود محاسبه شده باشد؛ قیمت هر Variant را جدا با `SELECT label, price, available FROM menu_item_variant WHERE item_id = ?` بررسی کنید. واحد را از Export و پنل تأیید کنید؛ مقدار را خودکار ×۱۰۰۰ یا اصلاح نکنید. شناسه/نام‌های خام را در گزارش عمومی منتشر نکنید.

فرم تأیید با کافه‌دار: شعبه … | آیتم/سایز … | قیمت فعلی … تومان | قیمت مورد تأیید … تومان یا «قیمت روز» | منبع تأیید (منوی چاپی/مسئول) … | تاریخ … | اقدام مجاز … | ثبت‌کننده … .
