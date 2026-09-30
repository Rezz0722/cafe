# پرامپت جامع اجرای Kucafe v3 روی Codex سرور

این متن را در Codex روی سروری که `kucafe.ir` روی آن اجرا می‌شود قرار بده. هدف، ارتقای همان سیستم موجود است؛ ساخت پروژهٔ جدید یا تبدیل آن به PHP نیست.

---

تو رهبر فنی و طراح ارشد محصول Kucafe هستی. باید نسخهٔ زندهٔ `kucafe.ir` را از وضعیت فعلی به Kucafe v3 ارتقا بدهی: یک محصول فارسی، محلی، تصویرمحور، سریع و قابل اعتماد برای پاسخ به سؤال «امروز کجا بریم؟».

## مأموریت قطعی

1. ابتدا سیستم واقعی، دیتابیس و deployment را read-only ممیزی کن.
2. `kucafe.zip` و همهٔ فایل‌های داخل Prompt Pack را بخوان؛ ۱۰ ماکاپ و Prototype HTML/CSS/JS را بررسی کن.
3. ظاهر، hierarchy و responsive behavior را از Prototype بگیر.
4. داده، امنیت، URL، SEO و رفتار واقعی را از پروژهٔ Next.js موجود بگیر.
5. UI جدید را مستقیم به Server Components، Server Actions و MySQL فعلی وصل کن.
6. همهٔ مسیرها و قابلیت‌های سالم را حفظ کن، تست کن و فقط بعد از preview سالم deploy کن.

## تصمیم معماری غیرقابل مذاکره

- سیستم فعلی Node.js/Next.js است و **باید Node.js/Next.js بماند**.
- بندهای PHP/shared-hosting داخل Prompt Pack تاریخی‌اند و برای این اجرا authority ندارند.
- hash routing، دادهٔ hardcoded، localStorage favorite و interactionهای toast-only Prototype را کپی نکن.
- REST API موازی نساز وقتی Server Component/Action فعلی همان کار را امن انجام می‌دهد.
- MySQL منبع حقیقت است. هیچ عدد، نظر، امتیاز، بازدید، کافه، تصویر یا قابلیت جعلی در production نمایش نده.

## Source of Truth

در تعارض‌ها این ترتیب را رعایت کن:

1. دستور فعلی کاربر و این سند
2. امنیت، Data Integrity و رفتار واقعی production
3. schema و کد اجرایی فعلی Next.js
4. Canonical Product/UI Prompt داخل ZIP
5. Prototype و ماکاپ‌ها به‌عنوان visual reference
6. اسناد تاریخی و استنتاج خودت

## خط قرمزهای عملیاتی

- بدون backup و rollback path هیچ migration مخرب اجرا نکن.
- checkout زنده را با `git reset --hard`، حذف recursive یا overwrite کور تغییر نده.
- secretها را چاپ، log یا commit نکن.
- رمز کاربر دیتابیس production را برای هماهنگ‌کردن checkout عوض نکن؛ config checkout را با Source of Truth امن هماهنگ کن.
- قبل از deploy روی پورت جداگانه (ترجیحاً 9090) preview بگیر.
- Apache/DirectAdmin و سایت‌های دیگر سرور را دست‌کاری نکن مگر Scope صریح باشد.
- تصاویر نمونهٔ ZIP را به کافهٔ واقعی نسبت نده. آن‌ها فقط برای hero/editorial fallback با برچسب روشن مجازند.
- capability سالم را به‌خاطر تغییر UI حذف نکن.

## تصویر هدف محصول

- دوستانه، محلی، مدرن، گرم، انسانی، تصویرمحور و border-first
- نه SaaS landing، نه اپ سفارش غذا، نه marketplace شلوغ و نه admin template عمومی
- رنگ CTA اصلی `#2F6FE0`؛ `#5996FF` فقط brand accent
- Dana با fallback Vazirmatn؛ اعداد نمایشی فارسی
- Surface سفید، `#F7F8FA` ثانویه، `#EEF4FF` brand soft
- radius کنترل 12–14، کارت 20، feature 24، pill 999
- max content width برابر 1280px؛ padding دسکتاپ 32 و موبایل 16
- target لمسی حداقل 44×44 و کنتراست WCAG 2.2 AA
- motion محدود 160/240/360ms و پشتیبانی `prefers-reduced-motion`
- native RTL با logical properties؛ mobile باید recompose شود، نه desktop کوچک‌شده

## Phase 0 — Audit اجباری

قبل از اولین تغییر، این خروجی را ثبت کن:

- مسیر واقعی checkout زنده و preview checkout
- نسخه‌های Node/Next/MySQL/MariaDB/PM2/Apache
- route inventory
- 37-table schema inventory و relationهای مهم
- countهای واقعی place/published/menu/media/facet/dish/district/review/user
- env/config source بدون افشای مقدار secret
- PM2 process و reverse proxy topology
- وضعیت backup، logs، cache، jobs و disk
- وضعیت unit/type/build/smoke
- dirty worktree و فایل‌های متعلق به کاربر
- KEEP / IMPROVE / REBUILD / REMOVE matrix
- Gap Map با EXISTS / PARTIAL / MISSING / CONFLICTING / NEEDS_MIGRATION / NEEDS_REBUILD

برای اعداد Snapshot اعتماد کور نکن؛ از DB واقعی بازاعتبارسنجی کن.

## قابلیت‌هایی که باید بدون Regression حفظ شوند

- `/`, `/search`, `/search?view=map`, `/mashhad`, `/mashhad/[district]`, `/cafe/[slug]`
- `/auth`, `/contribute`, `/profile` و زیرصفحه‌های profile
- `/admin`, `/admin/venue`
- filter/query parameterهای فعلی و Back/Refresh/Share URL
- FULLTEXT، district parsing، facets، attributes، dishes، price، open-now، near-me، sort و pagination
- نقشهٔ آفلاین MapLibre و routing serviceها
- منوی واقعی، قیمت نامعلوم به‌صورت NULL، تصاویر واقعی و وضعیت availability
- OTP/password auth، session، RBAC، impersonation و rate limitهای موجود
- favorites، review create/edit/moderation، taste quiz و recommendation reason
- owner info/hours/attributes/menu/bulk price/review reply
- admin moderation/users/settings/analytics/data health/audit/operations
- announcement، maintenance، sitemap، robots، canonical و JSON-LD

## ساختار UI پیشنهادی

### Shellها

- Public/Discovery: header سبک دسکتاپ، drawer استاندارد موبایل، footer charcoal
- Account: layout متمرکز و خلوت؛ از footer طولانی در auth پرهیز
- Dashboard: sidebar راست در دسکتاپ، drawer/tabs contextual در موبایل
- Mobile public bottom nav فقط برای خانه، کشف، نقشه/محله، ذخیره‌ها و پروفایل؛ حداکثر 5 مقصد

Drawer و dialog باید Escape، outside click، focus restoration، accessible name و body scroll behavior درست داشته باشند.

### Homepage

- Hero کوتاه و search-first با تیتر «امروز کجا بریم؟»
- search واضح برای intent/name و مسیر مستقل محله/نزدیک من در صورت اتصال واقعی
- quick intent فقط وقتی coverage واقعی دارد؛ CTA به zero result ممنوع
- trust strip فقط با گزارهٔ قابل اثبات
- کارت‌های منتخب با نام‌گذاری صادقانه؛ تا قبل از CMS نگوییم «دست‌چین‌شده»
- Mood cards پاستلی data-driven
- فقط چند district برتر با count واقعی، نه wall طولانی چیپ‌ها
- map CTA با count واقعی mappable places
- trending/collection فقط پس از داشتن source واقعی؛ fake collection ممنوع
- بخش مشارکت با مقصد واقعی `/profile/submit` یا `/contribute`

### Search

- یک search engine، دو entry point
- دسکتاپ: toolbar، sidebar فیلتر دائمی، active filters، result grid/list و map mode
- موبایل: search برجسته، rail فیلتر سریع، sort/filter در bottom sheet یا panel مناسب، map teaser و کارت افقی
- همهٔ فیلترها در URL باقی بمانند
- selected controls دارای `aria-pressed`/radio/tab semantics درست باشند
- loading/empty/error/no-location states اختصاصی
- هیچ notification CTA بدون storage/backend نشان نده
- «نزدیک من» در نهایت باید lat/lng را قبل از limit/pagination server-side رتبه‌بندی کند؛ اگر در این release اصلاح نشد، محدودیت را مستند کن و ادعای ranking جهانی نکن

### Cafe detail

- visible breadcrumb
- gallery image-forward با شمار و thumbnails؛ فقط رسانهٔ واقعی همان کافه/منو
- identity، district، status/open state، address و price context
- primary «مسیر»، secondary «ذخیره» و «اشتراک‌گذاری» واقعی با Web Share/clipboard fallback
- digital menu نزدیک ابتدای hierarchy با جست‌وجو و tabs sticky
- base/effective price، price unknown، availability و image fallback صادقانه
- about، amenities واقعی، grouped hours، map/address، reviews و similar cafes
- اگر `place_photo` خالی است layout graceful باشد؛ عکس generic را به مکان نسبت نده
- merged/permanently_closed/draft lifecycle باید policy روشن داشته باشد

### Profile

- identity hero و summary واقعی
- favorites، suggested cafes، reviews، submissions/corrections و settings
- recent visits را بدون مدل داده نساز
- هر بخش empty state و CTA واقعی داشته باشد

### Owner dashboard

- زبان بصری مشترک اما density کاربردی‌تر
- overview با metricهای تعریف‌شده و واقعی
- profile completeness با فرمول موجود و missing actions
- tabs/modules فعلی info/hours/menu/reviews حفظ شوند
- bulk price همیشه preview، confirmation، audit و recovery-aware باشد
- photo manager تا قبل از upload pipeline کامل نشان داده نشود

### Admin

- Operations Console برندشده، نه template عمومی
- permission-driven navigation
- queueهای moderation، venue/user management، settings، analytics، data health و operations حفظ شوند
- هر publish/delete/block/impersonate/bulk action دارای confirmation، feedback و audit باشد

## شکاف‌های Backend با اولویت

### همین release، کم‌ریسک

1. saved card باید نام محله را با join واقعی برگرداند، نه district ID.
2. recommendation باید `place_attribute` واقعی را مصرف کند.
3. zero-result writer موجود به search server flow وصل شود، privacy-safe و fail-soft.
4. status lifecycle در `getPlaceDetail` و route policy اصلاح شود.

### release بعد، نیازمند طراحی/migration

1. near-me server-side با bbox/haversine قبل از limit/pagination
2. `place_photo` gallery و upload pipeline امن: MIME واقعی، size/dimension، resize/WebP، audit
3. review pagination/reply/photo/vote/report
4. transaction برای replace hours/attributes/taste/approval/owner assignment
5. unique constraint برای یک review در هر user/place و validation subrating/visitDate
6. phone verification lifecycle و استفاده واقعی از `auth_session` برای revoke
7. collections/homepage curation schema با draft/preview/order/schedule

هیچ‌کدام را نیمه‌کاره و صرفاً نمایشی وارد UI نکن.

## قواعد Implementation

- TypeScript strict و Server Component پیش‌فرض؛ client boundary فقط برای interaction واقعی
- business logic در core/service، data access در query/repository و UI در component
- mutationها: authz → validation → transaction در صورت چندمرحله‌ای → audit → derived refresh → cache invalidation → revalidate
- query سنگین یا image processing در synchronous request انجام نشود
- map و bundleهای سنگین lazy-load شوند
- تصاویر دارای width/height، loading مناسب، `object-fit: cover` و alt صادقانه باشند
- duplicate token/global/font directories را بعد از اثبات عدم مصرف consolidate کن
- از Lucide موجود استفاده کن؛ SVG جدید دستی فقط برای brand mark ضروری
- هیچ control تعاملی بدون handler/target واقعی رندر نکن
- raw DB/stack error هرگز به UI نرسد

## استفاده از Subagentها

اگر concurrency موجود است، کار را با ownership بدون overlap تقسیم کن:

1. shell/home/design-system
2. search/cards/map UX
3. cafe detail/profile
4. backend gaps/tests/deployment audit

هر Subagent باید scope فایل مشخص داشته باشد. قبل از merge، root agent diff همه را مرور و test یکپارچه اجرا کند.

## تست و Acceptance

حداقل:

- unit tests کامل
- TypeScript noEmit
- production build
- DB verify، query/auth/manage/admin/settings/map smoke
- page smoke روی preview
- دستی یا E2E برای: search filters+back، list/map، geolocation denial، save/login gate، share fallback، menu search/category، review، owner save و admin permission
- عرض‌های 320، 360، 390، 768، 1024 و 1440
- keyboard-only، visible focus، Escape/dialog، labels/errors و reduced motion
- CTA برجسته به zero-result ممنوع
- fake metric/photo/review ممنوع
- route، canonical و query regression ممنوع
- صفحهٔ اصلی، search و cafe detail پاسخ 200 و بدون raw console/server error

اگر shimهای `.bin` خراب بودند، علت را برطرف کن یا باینری واقعی بسته را مستقیم برای verification اجرا کن؛ خطای ابزار را با خطای پروژه اشتباه نگیر.

## Performance gates

- تصویر mascot یک‌مگابایتی را در اندازه کوچک ship نکن؛ نسخه بهینه بساز یا از asset کوچک موجود استفاده کن
- static assets cache policy مناسب production داشته باشند
- MapLibre فقط در surface لازم load شود
- HTML/menu بزرگ graceful باشد و UI با 287 آیتم/30 دسته تست شود
- از N+1 و query تکراری settings جلوگیری کن
- Lighthouse هدف: Performance ≥ 85، Accessibility ≥ 95، SEO ≥ 95 روی صفحات public کلیدی، در حد توان محیط target

## Deploy کنترل‌شده

1. `git status` و snapshot commit/patch قابل rollback ثبت کن.
2. config production را بدون چاپ secret validate کن.
3. در صورت migration، DB backup + dry-run + reconciliation اجباری؛ اگر migration نداریم صریح ثبت کن.
4. build کامل بگیر.
5. preview را روی 9090 با همان config و DB اجرا کن.
6. smoke و صفحه‌های واقعی را روی preview تست کن.
7. فقط اگر همه Gateها سبزند، PM2 process همان اپ را reload کن؛ process جدید موازی نساز.
8. health و چند route production را بعد از reload بررسی کن.
9. اگر خطا بود، فوراً به نسخهٔ قبلی rollback کن و علت را با log redacted گزارش بده.
10. Apache/vhost/SSL و سرویس‌های سایت‌های دیگر را بدون نیاز تغییر نده.

## خروجی نهایی لازم

- خلاصهٔ Current → Target و تصمیم‌های تعارض
- فهرست فایل‌های تغییرکرده
- feature parity matrix
- migration/data impact و rollback
- نتایج دقیق test/build/smoke
- URL preview و سپس production در صورت deploy
- موارد باقی‌مانده با اولویت و دلیل، بدون ادعای «کامل» برای چیز تست‌نشده

کار را تا رسیدن به نسخهٔ تمیز، responsive، backend-connected و test‌شده ادامه بده. کیفیت ظاهری بدون صحت داده پذیرفته نیست و صحت فنی بدون UX قوی هم تحویل نهایی محسوب نمی‌شود.

## افزونهٔ الزامی: تفکیک کافه، آیتم منو و Dish

برای دامنه، route، migration، SearchIntentResolver، Item/Dish page، Owner menu و Gateهای مرحله‌ای، سند زیر جزو همین پرامپت و لازم‌الاجراست:

`docs/KUCAFE_V3_MASTER_IMPLEMENTATION_TASK_FA.md`

در تعارض، درخواست مستقیم کاربر و قرارداد سه‌موجودیتی سند تسک مادر اولویت دارد. جست‌وجوی «قهوه/پاستا» نباید صرفاً کارت کافه برگرداند؛ محصول واقعی باید نتیجهٔ مستقل داشته باشد، در حالی که نام کافه باید Venue را در اولویت نگه دارد.
