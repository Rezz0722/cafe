# لایه‌ی داده — از seed تا Postgres

## وضعیت فعلی

اپلیکیشن از یک **repository** داده می‌گیرد، نه مستقیم از دیتابیس:

```
صفحات (app/**)
      │  فقط توابع سطح‌بالا صدا می‌زنند
      ▼
src/core/places/repository.ts        ← interface + انتخاب آداپتور
      │
      ├── SeedPlaceRepository        ← فعال. از src/data/seed.ts می‌خواند
      └── PgPlaceRepository          ← هنوز نوشته نشده (پایین)
```

هیچ صفحه‌ای SQL نمی‌نویسد و هیچ صفحه‌ای نمی‌داند داده از کجا می‌آید. به همین
دلیل سوئیچ به Postgres، *صفر تغییر* در صفحات لازم دارد.

**چرا الان seed:** این محیط Postgres ندارد. مهم‌تر اینکه ارزش محصول از داده‌ی
واقعی می‌آید نه از زیرساخت — و داده‌ی واقعی هنوز جمع نشده (بخش ۳ سند معماری).
seed اسکلت است تا بقیه‌ی سیستم قابل ساخت و تست باشد.

> ⚠️ `src/data/seed.ts` داده‌ی **ساختگی** است. نام کافه‌ها از ماکاپ‌های طراحی
> آمده و کسب‌وکار واقعی نیستند. تنها چیز واقعی، مختصات مراکز محله‌هاست.

---

## سوئیچ به Postgres

### ۱. دیتابیس

```bash
# روی ماشین محلی یا سرور ایرانی (آروان، لیارا، پارس‌پک)
createdb cafegard
psql cafegard -c 'CREATE EXTENSION IF NOT EXISTS postgis;'
psql cafegard -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
```

`postgis` برای «نزدیک من» و block کردن dedupe لازم است؛ `pg_trgm` برای
شباهت نام در تشخیص تکراری.

### ۲. مهاجرت

```bash
export DATABASE_URL=postgres://user:pass@host:5432/cafegard
npm run db:generate     # SQL از src/db/schema.ts می‌سازد → drizzle/
```

بعد در فایل SQL تولیدشده، این دو ایندکس را دستی اضافه کنید. drizzle-kit
نمی‌تواند بسازدشان چون نوع `geography` و عملگر `gin_trgm_ops` را نمی‌شناسد:

```sql
CREATE INDEX place_geog_idx      ON place USING GIST (geog);
CREATE INDEX place_name_trgm_idx ON place USING GIN (name_normalized gin_trgm_ops);
```

سپس `npm run db:push`.

### ۳. آداپتور

`PgPlaceRepository` را بنویسید و در `src/core/places/repository.ts` وصل کنید:

```ts
const repository: PlaceRepository =
  process.env.DATABASE_URL ? new PgPlaceRepository() : new SeedPlaceRepository()
```

فقط سه متد لازم است — `listPlaces`، `getPlaceBySlug`، `listDistricts`.

**نکته‌ی مهم برای `listPlaces`:** رکورد `Place` تودرتوست (ویژگی‌ها، ساعت‌ها،
منو، نظرات). با Drizzle یا `db.query.place.findMany({ with: {...} })` بگیرید،
یا چند کوئری موازی بزنید و در حافظه join کنید. آنچه **نباید** بکنید، N+1
است: یک کوئری برای مکان‌ها و بعد یکی به‌ازای هر مکان.

**فاصله:** در `PgPlaceRepository` فاصله را به PostGIS بسپارید، نه به
`src/core/geo/distance.ts`:

```sql
ST_Distance(geog, ST_MakePoint($lng, $lat)::geography) / 1000 AS distance_km
```

هاورساینِ سمت اپلیکیشن برای seed خوب است؛ در مقیاس واقعی، ایندکس GiST
تفاوت بزرگی می‌سازد.

---

## چه چیزی مشتق است و نباید ذخیره شود

این‌ها عمداً در دیتابیس **نیستند** و در `src/core/places/view.ts` محاسبه
می‌شوند. اگر روزی وسوسه شدید ذخیره‌شان کنید، دلیلش را اینجا بخوانید:

| مقدار | چرا ذخیره نمی‌شود |
|---|---|
| `isOpenNow` | به لحظه وابسته است؛ ذخیره‌اش یعنی از همان لحظه غلط شدن |
| `distanceKm` | به موقعیت کاربر وابسته است |
| `rating` | میانگین بیزی از `rating_sum`/`rating_count` |
| `qualityScore` | از کامل‌بودن فیلدها |
| `freshnessScore` | از `field_provenance.observed_at` |

`rating_sum` و `rating_count` **materialized** هستند (با trigger یا در
لایه‌ی اپلیکیشن موقع ثبت نظر به‌روز شوند) — چون شمردن همه‌ی نظرات در هر
بارگذاری صفحه گران است. ولی خودِ *میانگین* هرگز ذخیره نمی‌شود.

---

## جست‌وجو: کِی Meilisearch لازم می‌شود

الان جست‌وجو در حافظه اجرا می‌شود (`src/core/search/query.ts`). با ۸ تا حتی
۳۰۰ کافه این کاملاً کافی است و یک سرویس اضافه فقط هزینه‌ی نگهداری است.

**آستانه‌ی مهاجرت:** وقتی یکی از این‌ها اتفاق افتاد —

- بیش از ~۲۰۰۰ مکان
- نیاز به تحمل غلط املایی روی نام (کاربر «کافه رف» را «کافه رووف» می‌نویسد)
- facet count زنده روی فیلترها

آن‌وقت `SearchIndex` را پشت یک interface مثل همین repository بگذارید و
Meilisearch را وصل کنید. نرمال‌سازی فارسی (`src/core/text/normalize.ts`)
باید **هم موقع ایندکس و هم موقع query** اعمال شود — اگر فقط یک طرف نرمال
شود، تطابق‌ها بی‌صدا از دست می‌روند.

---

## چرخه‌ی کیفیت داده

جدول‌های `field_provenance`، `edit_suggestion`، `place_claim` و `audit_log`
در شما هستند ولی هنوز UI ندارند. این عمدی است — فاز ۲ نقشه‌ی راه.

ترتیب درست ساختشان:

1. **صف اعتبارسنجی** — کافه‌هایی که `last_verified_at` قدیمی دارند، مرتب‌شده
   بر اساس محبوبیت. یک کوئری، نه یک پروژه.
2. **پیشنهاد اصلاح کاربر** — دکمه‌ی «این اطلاعات درست نیست» روی صفحه‌ی کافه
3. **تصاحب توسط مالک** — با تأیید دستی
4. **merge تکراری‌ها** — با blocking جغرافیایی + شباهت trigram

قدم ۲ آن نقطه‌ای است که هزینه‌ی نگهداری از خطی خارج می‌شود: تا قبلش شما تنها
منبع به‌روزرسانی داده‌اید.
