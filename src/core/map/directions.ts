/**
 * لینک مسیریابی به اپ‌های نقشه.
 *
 * ═══ چرا مسیریابی درون‌سایتی نداریم ═══
 *
 * مسیریابی واقعی به گراف جاده‌ها، ترافیک زنده و موتور routing (OSRM/Valhalla)
 * نیاز دارد. گراف جاده را داریم (از همان PBF) ولی ترافیک را نداریم، و مسیرِ
 * بدون ترافیک در مشهد عملاً گمراه‌کننده است. کاربر هم در نهایت مسیر را روی
 * موبایلش می‌خواهد، نه در تب مرورگر.
 *
 * پس کاری که واقعاً به کاربر کمک می‌کند این است: **دکمه‌ی مسیریابی که در
 * همان اپی باز شود که کاربر استفاده می‌کند.** نشان و بلد برای ایران
 * دقیق‌ترند؛ گوگل مپس برای کسی که فقط آن را دارد.
 *
 * ═══ نکته‌ی فنی مهم ═══
 *
 * ترتیب پارامترها بین سرویس‌ها متفاوت است و اشتباه‌شدنش باعث می‌شود کاربر به
 * نقطه‌ای در وسط بیابان هدایت شود:
 *
 *   نشان        @lat,lng,zoom   — عرض اول
 *   گوگل مپس    lat,lng          — عرض اول
 *   OSM         mlat=…&mlon=…    — نام‌دار، بی‌ابهام
 *   Waze        ll=lat,lng       — عرض اول
 *   بلد         latitude=&longitude= — نام‌دار
 *
 * ═══ چرا لینک `https` و نه اسکیمای اختصاصی اپ ═══
 *
 * وسوسه این است که `neshan://` و `waze://` بنویسیم تا «مستقیم اپ باز شود». ولی
 * اسکیمای اختصاصی، اگر اپ نصب **نباشد**، بی‌صدا شکست می‌خورد: کاربر یک صفحه‌ی
 * سفید یا خطای «آدرس ناشناس» می‌گیرد و هیچ راه برگشتی ندارد.
 *
 * لینک `https` هر دو کار را می‌کند: روی موبایل، اگر اپ نصب باشد سیستم‌عامل
 * خودش لینک را به اپ تحویل می‌دهد (Android App Links / iOS Universal Links) —
 * یعنی همان «یک کلیک، مستقیم در اپ». و اگر نصب نباشد، نسخه‌ی وبِ همان سرویس
 * باز می‌شود. برای کسی که هر چهار اپ را ندارد — یعنی اکثر کاربران — این تفاوتِ
 * بین «کار می‌کند» و «خراب است».
 *
 * برای کاربری که می‌خواهد اپِ **پیش‌فرضِ خودش** باز شود، `geoUri` پایین هست.
 *
 * ═══ چرا این لینک‌ها تست دارند ═══
 *
 * لینکِ بلد ۴۰۴ می‌داد و کسی متوجه نشده بود — چون دکمه رندر می‌شد، کلیک
 * می‌خورد و مرورگر یک صفحه‌ی خطای *سرویسِ دیگر* نشان می‌داد. تستِ
 * `directions.test.ts` شکلِ هر لینک را قفل می‌کند تا تغییرِ بعدی بی‌صدا نشکند.
 */

export interface DirectionTarget {
  lat: number
  lng: number
  name?: string
}

export interface DirectionLink {
  id: 'neshan' | 'google' | 'waze' | 'balad' | 'osm'
  label: string
  /** آدرس باز کردن مسیریابی از موقعیت فعلی کاربر. */
  href: string
  /** آدرس دیدن همان نقطه روی نقشه، بدون مسیریابی. */
  viewHref: string
  /** آیا در ایران قابل اتکاست؟ برای ترتیب نمایش. */
  local: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** مختصات را به شکل امن و با دقت مناسب درمی‌آورد. */
function coord(lat: number, lng: number): { lat: string; lng: string } {
  return {
    lat: clamp(lat, -90, 90).toFixed(6),
    lng: clamp(lng, -180, 180).toFixed(6),
  }
}

/**
 * لینک‌های مسیریابی برای یک مقصد.
 *
 * سرویس‌های ایرانی اول می‌آیند — در مشهد آدرس‌دهی نشان و بلد از گوگل مپس
 * دقیق‌تر است، خصوصاً برای کوچه‌ها و پاساژها.
 */
export function buildDirectionLinks(target: DirectionTarget): DirectionLink[] {
  const { lat, lng } = coord(target.lat, target.lng)
  const name = encodeURIComponent(target.name ?? 'کافه')

  return [
    {
      id: 'neshan',
      label: 'نشان',
      // نشان مسیریابی وب را با پارامتر مقصد می‌گیرد؛ اگر اپ نصب باشد،
      // سیستم‌عامل خودش لینک را به اپ می‌دهد.
      href: `https://neshan.org/maps/routing/car/#f=current,${lat},${lng}`,
      viewHref: `https://neshan.org/maps/@${lat},${lng},17z,0p`,
      local: true,
    },
    {
      id: 'balad',
      label: 'بلد',
      /*
        ⚠️ اینجا عمداً «مسیریابی» نیست، بلکه «نمایش نقطه» است.

        نسخه‌ی قبلی `balad.ir/directions?destination=…&origin=my-location`
        بود که **۴۰۴ می‌دهد** — یعنی دکمه‌ی بلد روی هر ۳۳۱ صفحه‌ی کافه به
        صفحه‌ی خطا می‌رفت. هر شکلِ دیگری هم امتحان شد و همه ۴۰۴ دادند:
        `/routing`، `/direction`، `/navigation`، `/route`،
        `/directions/car`. بلد آدرس وبِ عمومی برای مسیریابی ندارد.

        تنها شکلی که واقعاً ۲۰۰ می‌دهد همین `/location` است. کاربر را روی
        نقطه‌ی درست در بلد می‌گذارد و مسیریابی یک لمس بعدش است — که از
        صفحه‌ی ۴۰۴ بی‌نهایت بهتر است.
      */
      href: `https://balad.ir/location?latitude=${lat}&longitude=${lng}&zoom=17`,
      viewHref: `https://balad.ir/location?latitude=${lat}&longitude=${lng}&zoom=17`,
      local: true,
    },
    {
      id: 'google',
      label: 'گوگل مپس',
      // `api=1` شکل رسمی و پایدارِ لینک است؛ شکل‌های قدیمی‌تر بی‌هشدار
      // از کار می‌افتند.
      href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      viewHref: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      local: false,
    },
    {
      id: 'waze',
      label: 'ویز',
      // `www.` صریح نوشته شده: `waze.com/ul` یک ۳۰۱ به `www` می‌خورد و آن
      // یک پرشِ اضافه است که روی موبایل، تحویل لینک به اپ را کند می‌کند.
      href: `https://www.waze.com/ul?ll=${lat},${lng}&navigate=yes`,
      viewHref: `https://www.waze.com/ul?ll=${lat},${lng}`,
      local: false,
    },
    {
      id: 'osm',
      label: 'OpenStreetMap',
      href: `https://www.openstreetmap.org/directions?route=;${lat},${lng}`,
      viewHref: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}&title=${name}`,
      local: false,
    },
  ]
}

/** دو گزینه‌ی اصلی — برای جایی که فضای نمایش کم است (کارت، هدر موبایل). */
export function primaryDirectionLinks(target: DirectionTarget): DirectionLink[] {
  const all = buildDirectionLinks(target)
  return [all.find((link) => link.id === 'neshan')!, all.find((link) => link.id === 'google')!]
}

/**
 * لینک `geo:` — استاندارد سیستم‌عامل.
 *
 * روی اندروید و iOS، اپِ نقشه‌ی پیش‌فرضِ خودِ کاربر را باز می‌کند. روی دسکتاپ
 * معمولاً کار نمی‌کند، پس به‌عنوان گزینه‌ی اصلی استفاده نمی‌شود.
 */
export function geoUri(target: DirectionTarget): string {
  const { lat, lng } = coord(target.lat, target.lng)
  const label = target.name ? `(${encodeURIComponent(target.name)})` : ''
  return `geo:${lat},${lng}?q=${lat},${lng}${label}`
}
