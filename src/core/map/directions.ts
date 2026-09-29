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
 *   نشان        lat,lng          — عرض اول؛ از لینک رسمی کوتاه `nshn.ir`
 *   گوگل مپس    lat,lng          — عرض اول
 *   OSM         mlat=…&mlon=…    — نام‌دار، بی‌ابهام
 *   Waze        ll=lat,lng       — عرض اول
 *   بلد         latitude=&longitude= — نام‌دار
 *
 * ═══ Deep Link رسمی نشان ═══
 *
 * مستند رسمی نشان برای Android/Web لینک `nshn.ir` و برای iOS اسکیمای
 * `neshan://` را معرفی می‌کند. مسیر مستقیم به هر دو مختصات مبدأ و مقصد نیاز
 * دارد؛ بنابراین UI موقعیت فعلی را می‌گیرد و توابع پایین لینک دقیق را می‌سازند.
 * لینک نقطه (`href`) fallback بدون مجوز موقعیت و بدون JavaScript است.
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

/** لینک رسمی Android/Web نشان؛ اپ نصب باشد باز می‌شود وگرنه وب نشان. */
export function neshanPointLink(target: DirectionTarget): string {
  const { lat, lng } = coord(target.lat, target.lng)
  return `https://nshn.ir/?lat=${lat}&lng=${lng}`
}

/** لینک رسمی مسیریابی نشان برای Android/Web، با fallback بومی به وب. */
export function neshanRouteLink(origin: DirectionTarget, target: DirectionTarget): string {
  const from = coord(origin.lat, origin.lng)
  const to = coord(target.lat, target.lng)
  return `https://nshn.ir?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&vehicle=d`
}

/** Deep Link رسمی iOS نشان؛ UI در صورت نصب‌نبودن اپ به neshanRouteLink برمی‌گردد. */
export function neshanIosRouteLink(origin: DirectionTarget, target: DirectionTarget): string {
  const from = coord(origin.lat, origin.lng)
  const to = coord(target.lat, target.lng)
  return `neshan://?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&vehicle=d`
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
      // fallback رسمی و قابل‌کلیک بدون JS؛ مسیر مستقیم پس از گرفتن مبدأ در UI.
      href: neshanPointLink(target),
      viewHref: neshanPointLink(target),
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
