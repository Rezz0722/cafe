# گزارش تحویل اسپرینت P2 — ۱۶ مهر ۱۴۰۵

## خلاصه مدیریتی

سه مسیر کاری آمادهٔ بازبینی شدند و هیچ‌کدام Merge یا منتشر نشده‌اند؛ P2-02 از نظر Git به P2-01 وابسته است. P2-01 عملیات گروهی ایمن منو را با پیش‌نمایش امضاشده، کنترل نسخهٔ شعبه، ثبت Audit و اعمال اتمیک اضافه می‌کند. P2-02 ورود کنترل‌شدهٔ خروجی JSON/CSV موجود را به‌صورت «فقط ساخت آیتم تازه» فراهم می‌کند؛ دادهٔ موجود به‌طور پیش‌فرض تغییر نمی‌کند. P2-03 ابزارهای آموزش و سنجش پایلوت دو کافه را آماده می‌کند. آزمون‌های محلی، MariaDB دورریختنی و مرورگر ایزوله اجرا شده‌اند. آزمون Excel دسکتاپ، QR چاپی و استفادهٔ واقعی کافه‌دار هنوز انجام نشده‌اند و نتیجهٔ آن‌ها «در انتظار پایلوت» است.

| مسیر | پیاده‌سازی | آزمون | PR | وضعیت |
| --- | --- | --- | --- | --- |
| P2-01 | انتخاب گروهی، موجودی، ویژه، آرشیو/بازگردانی، Preview و Apply اتمیک | Unit/Integration، Build و مرورگر ایزوله پاس | [#71](https://github.com/Rezz0722/cafe/pull/71) | آمادهٔ بازبینی؛ CI سبز |
| P2-02 | Import JSON v1/CSV خروجی فعلی با سیاست create-only، تعارض و Revision | Unit/Integration، Build، مرورگر ایزوله و CI پاس | [#73](https://github.com/Rezz0722/cafe/pull/73) | Stacked بر #71؛ پس از تغییر Base، CI باید دوباره کنترل شود |
| P2-03 | راهنمای مالک، Playbook، Scorecard، بستهٔ Excel/QR/قیمت/ثبت باگ | نمونهٔ CSV بازتولیدپذیر و CI پاس | [#72](https://github.com/Rezz0722/cafe/pull/72) | آمادهٔ استفادهٔ آزمایشی؛ آزمون‌های میدانی باز |

## تغییرات و تصمیم‌های معماری

### P2-01

- Branch: `feat/p2-01-safe-batch-menu`؛ Commit: `47144a2ea7e0fe74a57dafe3be3b3bba1a2dee7f`.
- فایل‌های اصلی: `src/core/places/menuBatch.ts` و تست MariaDB آن، `src/components/venue/MenuBatchPanel.tsx`، اکشن/State پنل، CSS و `docs/P2_01_SAFE_BATCH_MENU_FA.md`.
- از RBAC، Revision، Owner Override، Audit و Cache موجود استفاده شده است. سقف هر عملیات ۱۰۰ آیتم است. تغییر قیمت گروهی موجود بازنویسی نشده است. Undo خودکار به‌خاطر خطر بازنویسی تغییر بعدی اضافه نشده؛ Recovery از Audit انجام می‌شود.
- Preview فقط خواندنی است؛ Apply با کنترل دوبارهٔ نقش و شناسهٔ واقعی آیتم، قفل شعبه، Fingerprint داده و Transaction اجرا می‌شود. فقط یک Revision برای هر عملیات موفق ثبت می‌شود.

### P2-02

- Branch: `feat/p2-02-menu-roundtrip`؛ Commit اولیهٔ قابلیت: `10a7c26377c66793a9b05eefee0b929e6b5c3d27`؛ Base PR فعلاً Branch مربوط به #71 است.
- فایل‌های اصلی: `src/core/import/menuPortable.ts`، `portableMenuImport.ts` و تست‌های آن‌ها، `src/components/venue/PortableMenuImportPanel.tsx`، اکشن/State پنل، تست مرورگر `scripts/p2-menu-ui-smoke.ts` و `docs/P2_02_MENU_ROUNDTRIP_FA.md`.
- قرارداد Export JSON v1 و CSV نه‌ستونه و Import سادهٔ قبلی تغییر نکرده‌اند. Import جدید فقط آیتم‌های تازهٔ انتخاب‌شده را می‌سازد؛ آیتم موجود، حتی آرشیوی، Skip می‌شود. سقف فایل ۵۱۲ KiB، حداکثر ۵۰۰ آیتم در تحلیل و ۲۰ آیتم در هر Apply است.
- JSON دادهٔ سایز، موجودی، آرشیو و ویژه‌بودن را حفظ می‌کند. CSV اطلاعات فرادادهٔ کافی برای Round-trip بی‌اتلاف ندارد؛ محدودیت و موارد مبهم در Preview/سند مشخص شده است. URL تصویر فقط مرجع گزارش‌شده است؛ فایل تصویری منتقل یا Hotlink نمی‌شود. تاریخ قیمت قدیمی به‌عنوان تأیید انسانی جعل نمی‌شود.
- Preview با HMAC ده‌دقیقه‌ای به فایل، کاربر، شعبه، Revision و Snapshot داده متصل است؛ Apply با مجوز زنده و Transaction انجام می‌شود. برای کشف تعارض، `publicId` خارجی بدون تطبیق شعبه قابل اعتماد نیست.

### P2-03

- Branch: `docs/p2-pilot-readiness`؛ Commit: `6bf70110d087785ee67dbd8e4dedb012adaff3b3`.
- فایل‌ها: `docs/P2_03_PILOT_READINESS_FA.md`، راهنماها و فرم‌های `docs/pilot/`، نمونهٔ `SAMPLE_MENU_EXPORT.csv` و مولد `scripts/generate-pilot-menu-csv.ts`.
- نمونهٔ CSV با Serializer واقعی خروجی ساخته شده و BOM، متن فارسی، قیمت صفر/نامعلوم، سایز، چندخطی و escape فرمول را دارد؛ دادهٔ شخصی یا Production ندارد.

## شواهد کیفیت

| Gate | نتیجه |
| --- | --- |
| Typecheck و ESLint | Pass روی کد نهایی P2-02 |
| Unit پیش‌فرض | ۴۶۴ Pass، ۱۱ Skip وابسته به محیط، ۰ Fail |
| MariaDB ایزوله | ۱۱ Pass، ۰ Fail برای P2-01 و P2-02؛ سناریوهای نقش، شعبه، Replay، Revision، Rollback، قیمت و آرشیو |
| Build ایزوله Next.js | Pass با `NEXT_DIST_DIR=.next-p2`؛ خروجی Production تغییر نکرد |
| مرورگر احرازشدهٔ QA | Pass در ۳۲۰/۳۶۰/۴۳۰/۱۴۴۰ px؛ RTL، Preview هر دو پنل، فوکوس و انتخاب با صفحه‌کلید، پیام خطای فایل خراب، بدون Overflow/خطای JS/Write در Preview |
| Security و diff | `npm run secrets:check` و `git diff --check`: Pass؛ Dependency یا Schema تازه اضافه نشده |
| Excel دسکتاپ / QR چاپی / دو کافه | NOT TESTED؛ معیار پایلوت، نه نتیجهٔ ساختگی |

محیط MariaDB برای آزمون‌ها دورریختنی و فقط روی loopback بوده است. تست‌های Write روی دیتابیس Production اجرا نشده‌اند.

## GitHub و انتشار

- [PR #71](https://github.com/Rezz0722/cafe/pull/71) — CI [موفق](https://github.com/Rezz0722/cafe/actions/runs/38825288992).
- [PR #72](https://github.com/Rezz0722/cafe/pull/72) — CI [موفق](https://github.com/Rezz0722/cafe/actions/runs/38825552139).
- [PR #73](https://github.com/Rezz0722/cafe/pull/73) — [CI موفق کد و تست‌ها](https://github.com/Rezz0722/cafe/actions/runs/38874311427)؛ نتیجهٔ آخرین Head و CI پس از تغییر Base پیش از Merge مجدداً خوانده شود.
- #73 باید پس از #71 بازپایه/به `production` تغییر Base داده شود و Diff/CI مستقل دوباره کنترل شود. #72 از این دو مستقل است. هر سه PR باز و Merge نشده‌اند.

Production در آغاز و پایان روی SHA `4fed25fe3e578c4480fff4b192dbaf2a62e6b3bf` در GitHub و Imageهای App/Worker با Tag `sha-4fed25fe3e57`، هر دو Healthy بود. `MERGE: NOT EXECUTED`؛ `DEPLOY: NOT EXECUTED`؛ `MIGRATION: NOT EXECUTED`؛ `TOPMENU APPLY: NOT EXECUTED`. تغییر Schema پیشنهاد نشده است. پس از توقف دیتابیس QA و پاک‌سازی Build ایزوله، فضای آزاد حدود ۶٫۳ GiB و Inode آزاد کافی بود.

## ریسک‌ها و تصمیم Reviewer

1. #71: امنیت، قیمت و اتمیک‌بودن در MariaDB ایزوله آزموده شده‌اند؛ Reviewer قرارداد UI و Audit را بازبینی کند. PR برای Merge فنی آماده است، اما انتشار Production نیازمند Release Gate جداگانه است.
2. #73: فقط پس از #71 Merge شود؛ سیاست CSV عمداً lossy است. فایل CSV با همهٔ سایزها ناموجود و قیمت پایهٔ مثبت، به دلیل ابهام رد می‌شود و JSON راه بازیابی کامل است. CI آخرین Head و Diff مستقل پس از تغییر Base دوباره بررسی شوند.
3. #72: سند و ابزار پایلوت آماده‌اند؛ نتیجهٔ Excel واقعی، QR چاپ‌شده و استفادهٔ دو کافه هنوز Pending است.
4. نبود نشست مجاز Production برای Smoke احرازشده با تست مرورگر/Integration ایزوله جایگزین شده، نه اینکه Pass عملیاتی Production ادعا شود.

## اقدام صبح

PRها را به ترتیب وابستگی بازبینی کنید؛ دربارهٔ Merge/Deploy تصمیم جداگانه بگیرید و پس از تغییر Base #73، CI همان Head را دوباره کنترل کنید. برای پایلوت، دو کافه و مسئول منو را تعیین و چک‌لیست Excel، QR و سنجش ۳۰روزه را اجرا کنید. هیچ اقدام Production در این اسپرینت انجام نشده است.
