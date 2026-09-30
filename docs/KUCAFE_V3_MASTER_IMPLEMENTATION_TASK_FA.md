# تسک مادر چندفازی ارتقای کامل Kucafe v3

وضعیت: فعال
اولویت محصول: Mobile-first
مرجع‌ها: درخواست مستقیم کاربر، متن خام Prompt Pack، Canonical Prompt، ده ماکاپ، Prototype و دیتابیس واقعی Next.js

### پیشرفت اجرایی تا ۱۴۰۵/۰۶/۱۹

- قرارداد Place / MenuItem / Dish در کد و جست‌وجو اعمال شد.
- `scope=all|places|items` و intent resolver برای قهوه، پاستا و Dishها فعال شد.
- صفحهٔ مستقل `/item/[publicId]/[slug]` و `/dish/[slug]` ساخته شد.
- کارت آیتم mobile-first، لینک دوطرفهٔ Cafe ↔ Item و مقایسهٔ Dish فعال شد.
- migration افزایشی `public_id` با unique index اجرا و backup فشرده ثبت شد.
- کنترل deploy برای وجود ستون/index و یکتایی همهٔ `public_id`ها به `db:verify` اضافه شد.
- پنل مالک به ویرایش نام/توضیح/قیمت/موجودی و ساخت دسته/آیتم متصل شد.
- ساخت و ویرایش آیتم از آپلود عکس امن تا تولید WebP کارت/بزرگ، dedupe محتوا، ثبت media و حذف اتصال عکس پوشش داده شد.
- importer مخرب destructive قبل از reset دیتابیس پر متوقف می‌شود؛ حذف cascade فقط با `ALLOW_DESTRUCTIVE_IMPORT=1` و backup آگاهانه ممکن است.
- importer مخرب روی دیتابیس پر به‌صورت پیش‌فرض قفل شد تا owner item، review، saved place و roleها با cascade حذف نشوند؛ reset فقط با پرچم صریح پس از backup ممکن است.
- صفحات Dish محبوب وارد sitemap شدند و متادیتای جست‌وجوی آیتم با نوع نتیجه هماهنگ شد.
- autocomplete زنده و نوع‌دار برای Place / MenuItem / Dish / Facet / District با ناوبری لمسی و کیبورد به دیتابیس وصل شد.
- zero-result اکنون requested scope، entity نهایی و intent حل‌شده را جدا ثبت و در گزارش ادمین با برچسب «کافه/آیتم» نمایش می‌دهد.
- migration دستی افزایشی `0002_search_entity_analytics.sql` پس از backup مستقل `backups/kucafe-before-search-log-entity-2026-09-10.sql.gz` روی DB preview اعمال شد؛ rollback کنار آن نگهداری می‌شود.
- MapLibre در Search، Cafe و District از bundle اولیه جدا و پایین صفحه viewport-lazy شد؛ First Load صفحهٔ کافه از ۳۶۹KB به ۱۲۳KB رسید.
- تست‌های unit، typecheck، item DB smoke و public page smoke اضافه شد.
- smoke احراز هویت با نشست واقعی ادمین برای Profile، Review، Admin و Venue Panel بدون تغییر داده اجرا شد.
- preview عمومی آخرین build روی `http://45.159.115.116:9091` فعال و ۱۹ مسیر اصلی smoke شد.

## ۱. نتیجه‌ای که باید تحویل شود

کوکافه باید یک موتور کشف دووجهی و یکپارچه باشد:

- جست‌وجوی نام «کافه» باید کافه/مکان را در اولویت نمایش دهد.
- جست‌وجوی «قهوه»، «پاستا»، «لاته» یا نام خوراکی باید آیتم‌های واقعی منو را نمایش دهد.
- هر آیتم منو صفحهٔ مستقل، پایدار و متصل به کافهٔ ارائه‌دهنده داشته باشد.
- هر Dish کانونی مثل «پاستا آلفردو» صفحهٔ مقایسهٔ آیتم‌های آن Dish در کافه‌های مختلف داشته باشد.
- صفحهٔ کافه و صفحهٔ آیتم از هم جدا باشند، ولی کاربر بدون بن‌بست بین آن‌ها حرکت کند.
- هیچ قیمت، تصویر، موجودی، امتیاز، ترند یا پیشنهاد ساختگی نمایش داده نشود.
- مسیر کامل روی موبایل با یک دست، target حداقل ۴۴px و hierarchy روشن قابل استفاده باشد.

## ۲. قرارداد دامنه؛ سه موجودیت مستقل

### Place / Venue

خود کسب‌وکار و فضای فیزیکی است: نام، نوع، محله، آدرس، مختصات، ساعت، امکانات، وضعیت انتشار، نظرها و مالک.

### Menu Item

محصول مشخص در منوی یک Place است: نام واقعی همان کافه، توضیح، تصویر، قیمت پایه/موثر، موجودی، دسته و زمان به‌روزرسانی. «آیس لاته نارگیل کافه X» یک Menu Item است و به همان کافه تعلق دارد.

### Dish

مفهوم کانونی و قابل مقایسه است: لاته، آیس لاته، پاستا آلفردو، سالاد سزار و غیره. چند Menu Item از چند کافه می‌توانند به یک Dish وصل شوند. Dish جای Menu Item را نمی‌گیرد.

قاعدهٔ نمایش:

```text
قهوه             → Item discovery بر پایهٔ facet=coffee
پاستا            → Item discovery بر پایهٔ facet=pasta
پاستا آلفردو     → Dish page + آیتم‌های واقعی مرتبط
کافه عمارت روشن → Place result در اولویت
عبارت مبهم       → نتیجهٔ گروه‌بندی‌شدهٔ «کافه‌ها / آیتم‌های منو» با امکان تغییر scope
```

## ۳. یافته‌های قطعی Audit

- Prototype فقط منو را داخل صفحهٔ کافه نمایش می‌دهد و صفحهٔ مستقل آیتم ندارد.
- متن خام کاربر صریحاً تفکیک نتیجهٔ محصول از نتیجهٔ کافه را می‌خواهد.
- Search فعلی با `q` فقط روی نام Place جست‌وجو می‌کند؛ `dish` و `facet` نیز در نهایت کارت کافه برمی‌گردانند.
- دیتابیس ۱۹٬۳۸۶ Menu Item و ۹۸ Dish دارد.
- ۱۹٬۳۸۶ آیتم فعلی همگی `source_id` دارند و در snapshot فعلی یکتا هستند.
- ۱۸٬۴۵۸ آیتم قیمت، ۱۱٬۰۱۱ تصویر و ۷٬۴۲۵ نگاشت Dish دارند.
- import فعلی Placeها را cascade-delete می‌کند؛ در نتیجه `menu_item.id` پس از import پایدار نیست.
- FULLTEXT روی `place` و `menu_item` موجود است؛ زیرساخت پایه برای جست‌وجوی دو Entity آماده است.
- صفحات و تصاویر Prototype مرجع hierarchy و حس بصری‌اند، نه منبع داده.

## ۴. فاز صفر — تثبیت مرجع و Baseline

کارها:

- ثبت route، schema، count، index، env source، PM2/Apache و backup topology.
- اجرای unit، typecheck، build، DB/query/page smoke.
- ثبت screenshot در ۳۲۰، ۳۶۰، ۳۹۰، ۷۶۸، ۱۰۲۴ و ۱۴۴۰.
- ثبت KEEP / IMPROVE / REBUILD / REMOVE برای هر surface.
- حفظ preview مستقل از production.

Gate خروج:

- baseline قابل تکرار، rollback روشن و هیچ secret در log/commit نباشد.

## ۵. فاز یک — Information Architecture و UX Flow

کارها:

- تعریف IA نهایی برای Home، Search، Place، Item، Dish، District، Profile، Owner و Admin.
- تعریف journeyهای اصلی موبایل:
  1. ورود → جست‌وجوی خوراکی → مقایسه → صفحهٔ آیتم → صفحهٔ کافه → مسیر
  2. ورود → جست‌وجوی نام کافه → صفحهٔ کافه → منو → صفحهٔ آیتم
  3. Home intent → نتایج واقعی → فیلتر → ذخیره
- تعریف stateهای loading، empty، error، unavailable، unknown price و no-location.
- طراحی segmented scope برای «همه / کافه‌ها / آیتم‌های منو».
- طراحی autosuggest تایپ‌دار با Venue، District، Dish، Facet و Item.

Gate خروج:

- هیچ CTA بدون مقصد یا backend و هیچ branch بدون empty/error state نباشد.

## ۶. فاز دو — هویت پایدار آیتم و Migration امن

مدل هدف:

- افزودن `public_id` پایدار و unique به `menu_item`؛ URL هرگز به autoincrement وابسته نباشد.
- افزودن slug نمایشی مشتق از نام، بدون اینکه slug هویت اصلی باشد.
- `source_id` آیتم‌های importشده unique و nullable بماند؛ آیتم owner-created می‌تواند source نداشته باشد.
- افزودن timestampهای create/update/archive و قرارداد soft-delete در صورت نیاز تاریخچه.
- refactor import از delete/reinsert به upsert/reconcile بر اساس Source Identity.
- حفظ `public_id`، review/reference و تاریخچهٔ قیمت در re-import.

Route هدف:

```text
/item/[publicId]/[slug]   صفحهٔ یک آیتم واقعی
/dish/[slug]              صفحهٔ مقایسهٔ یک Dish کانونی
```

Migration Gate:

- backup، dry-run، backfill، unique validation، row reconciliation و rollback SQL.
- هیچ migration روی production قبل از تأیید preview و backup اجرا نشود.

## ۷. فاز سه — Search Platform چندموجودیتی

کارها:

- ساخت `SearchIntentResolver` deterministic:
  - exact/strong Venue و alias
  - District
  - exact Dish و dish alias
  - Facet/category
  - Menu Item FULLTEXT
  - Attribute/amenity/intent
  - fallback گروه‌بندی‌شده
- افزودن URL contract سازگار:
  - `scope=all|places|items`
  - حفظ `q,f,a,dish,d,max,open,near,sort,view,page`
- Generic item query مانند قهوه از facet استفاده کند، نه `LIKE` کور.
- نام دقیق Dish به Dish resolve شود و variantهای واقعی Menu Item را برگرداند.
- exact Venue در mixed result بالاتر از product noise باشد.
- count و pagination هر Entity مستقل و دقیق باشد.
- active filter، Back، Refresh و Share URL کامل کار کنند.
- zero-result با query privacy-safe، scope و resolved intent ثبت شود.

Autosuggest:

- نتیجه‌ها با icon/label نوع مشخص شوند.
- keyboard، touch، Escape، outside click، loading و empty state داشته باشد.
- پیشنهاد Dish به `/dish/[slug]`، Place به `/cafe/[slug]` و Item به route پایدار خودش برود.

Gate خروج:

- تست‌های ثابت برای «قهوه»، «پاستا»، «پاستا آلفردو»، نام کافه، نام محله و عبارت مبهم.
- query plan ایندکس‌دار و بدون N+1.

## ۸. فاز چهار — Item Discovery UI

Item Card باید فقط دادهٔ تصمیم‌ساز را نشان دهد:

- تصویر واقعی آیتم یا fallback گرافیکی صادقانه
- نام آیتم
- نام و لینک کافه
- محله
- قیمت موثر؛ قیمت نامعلوم با متن روشن
- موجود/ناموجود با متن و رنگ
- زمان آخرین به‌روزرسانی در صورت stale بودن
- برچسب Dish/Facet در صورت واقعی بودن

Mobile:

- کارت افقی، تصویر ۱۱۰–۱۳۰px، متن حداکثر دو خط و قیمت قابل اسکن.
- scope و quick filters sticky/rail؛ filterها bottom sheet.
- map فقط برای Placeها؛ در Item scope نقشه باید «کافه‌های ارائه‌دهنده» را نشان دهد و این تفاوت را بگوید.

## ۹. فاز پنج — صفحهٔ Item و Dish

### Item Detail

- breadcrumb: خانه ← کافه ← دستهٔ منو ← آیتم
- تصویر، نام، توضیح، قیمت پایه/موثر، تخفیف معتبر، موجودی و freshness
- کارت ارائه‌دهنده با وضعیت باز، محله، آدرس، مسیر، ذخیره و لینک منوی کامل
- آیتم‌های مشابه همان Dish و همان کافه به‌صورت جدا
- دادهٔ ساختاریافته مناسب؛ Offer فقط با قیمت/موجودی واقعی
- thin/unknown pages برابر `noindex`; canonical روشن

### Dish Detail

- توضیح کوتاه و غیرجعلی بر پایهٔ taxonomy
- بازه و میانهٔ قیمت واقعی، تعداد آیتم و کافه
- variantهای واقعی با فیلتر محله، قیمت، موجودی و نزدیک من
- مقایسهٔ آیتم‌ها؛ نه صرفاً تکرار کارت کافه
- صفحه‌بندی، canonical، breadcrumb و ItemList JSON-LD

Gate خروج:

- آیتم unavailable یا Place غیرعمومی به‌درستی پنهان/علامت‌گذاری شود.
- عکس generic به محصول واقعی نسبت داده نشود.

## ۱۰. فاز شش — اتصال دوطرفه با صفحهٔ کافه

- هر Menu Item داخل منوی کافه به صفحهٔ آیتم لینک شود.
- کلیک روی خود کارت آیتم با کنترل‌های داخلی تداخل نداشته باشد.
- search داخل منوی کافه client-side بماند ولی URL مستقل آیتم قابل اشتراک باشد.
- CTA «دیدن همهٔ آیتم‌های این کافه» و برگشت به category anchor اضافه شود.
- Item detail بتواند کاربر را دقیقاً به منوی همان Place برگرداند.

## ۱۱. فاز هفت — Homepage و Curation واقعی

- دو entry point جست‌وجو: Quick Search سراسری و Descriptive Search اصلی، یک موتور مشترک.
- Trending، Featured، Mood و Collection فقط با مدل دادهٔ واقعی و Admin configuration.
- mood card به Place یا Item collection واقعی وصل شود و zero-result CTA ممنوع باشد.
- محله‌ها به `/mashhad` و نقشهٔ کامل متصل شوند.
- Home CMS دارای draft، order، preview، schedule و audit باشد.
- کارت‌های آیتم/خوراکی ترند در Home فقط با دادهٔ واقعی قابل فعال‌سازی باشند.

## ۱۲. فاز هشت — Owner Digital Menu

- CRUD کامل category و item؛ reorder، enable/disable، archive و image pipeline.
- edit نام، توضیح، تصویر، قیمت، موجودی و Dish mapping.
- تخفیف item/category با base/effective price، start/end، timezone و stacking policy.
- bulk price با impact preview، confirmation، batch snapshot، audit و rollback.
- هر تغییر public page/search cache را invalidate و derived aggregateها را rebuild کند.

## ۱۳. فاز نه — Profile و Personalization

- Taste Quiz مرحله‌به‌مرحله، یک سؤال در هر صفحه/step با progress و امکان شروع دوباره.
- سؤال‌ها فقط پس از تکمیل attribute/facet coverage نهایی شوند.
- نتیجهٔ پیشنهادها ثابت و explainable در پروفایل ذخیره شود.
- favorites و suggested جدا باشند.
- درخواست نظر پس از visit signal واقعی؛ بدون مدل visit popup جعلی ساخته نشود.
- reason هر پیشنهاد به دادهٔ واقعی facet/dish/attribute وصل باشد.

## ۱۴. فاز ده — Admin، Observability و Data Health

- مدیریت Place، Menu Item، Dish، Facet و mappingها با جست‌وجو و فیلتر.
- dashboard جست‌وجوی بی‌نتیجه بر اساس scope و entity gap.
- queue برای آیتم‌های بدون Dish، تصویر، قیمت یا description.
- homepage curation و trend assignment با تاریخ شروع/پایان.
- data-health cron idempotent و گزارش import/reconciliation.
- تمام publish/archive/discount/bulk/assignmentها audit شوند.

## ۱۵. فاز یازده — QA، Performance و انتشار

حداقل Gateها:

- unit + integration + typecheck + production build
- DB verify و query/auth/manage/admin/settings/map smoke
- page smoke برای `/`, `/search`, `/item/...`, `/dish/...`, `/cafe/...`
- E2E موبایل برای search scope، autosuggest، filter sheet، Item → Cafe → Route
- ۳۲۰/۳۶۰/۳۹۰/۷۶۸/۱۰۲۴/۱۴۴۰
- keyboard، focus، Escape، screen reader labels و reduced motion
- تست قیمت null/zero/stale/discount و available/unavailable
- تست draft/temp/permanent/merged Place
- query performance و pagination با dataset کامل
- no fake metric/photo/review/trend

Deploy:

1. snapshot و backup
2. migration dry-run و reconciliation
3. build
4. preview روی پورت مستقل
5. smoke/E2E
6. reload همان PM2 process
7. health check production
8. rollback فوری در صورت failure

## ۱۶. Definition of Done نهایی

- Search نام کافه و محصول را درست تفکیک می‌کند.
- Item و Dish صفحهٔ مستقل، پایدار، shareable و backend-connected دارند.
- منوی کافه به Item page وصل است.
- mobile journey بدون بن‌بست و بدون control نمایشی است.
- owner می‌تواند item را واقعاً مدیریت کند و تغییر در public/search دیده می‌شود.
- admin gapهای داده و zero-result را می‌بیند.
- همهٔ قابلیت‌های سالم فعلی حفظ شده‌اند.
- نتایج test/build/smoke و migration reconciliation ثبت شده‌اند.

## ۱۷. ترتیب اجرای فعلی

- [x] Audit اولیهٔ سایت، ZIP، ماکاپ، Prototype و دیتابیس
- [x] بازطراحی اولیهٔ public shell/home/search/cafe با تمرکز موبایل
- [x] اتصال zero-result، recommendation attributes، saved district و public status policy
- [ ] تثبیت public identity آیتم و import-safe contract
- [ ] SearchIntentResolver و نتایج چندموجودیتی
- [ ] Item Card و Item Search scope
- [ ] Item Detail و Dish Detail
- [ ] اتصال منوی Place به Item
- [ ] Home curation واقعی
- [ ] Owner menu/discount hardening
- [ ] Personalization نهایی
- [ ] Admin/data health تکمیلی
- [ ] QA و deploy production
