/**
 * دود-تست صفحات، با نشست واقعی.
 *
 *   node scripts/pages-smoke.mjs [baseUrl]
 *
 * برای هر صفحه یک درخواست می‌زند و بررسی می‌کند که **متنِ مورد انتظار در
 * HTML سرور باشد** — نه فقط اینکه ۲۰۰ برگشته. صفحه‌ای که ۲۰۰ می‌دهد ولی
 * محتوایش خالی است، از صفحه‌ی ۵۰۰ بدتر است چون بی‌صدا خراب است.
 *
 * نشست از `scripts/session-token.ts` می‌آید و در `.cookie.tmp` است.
 */

import { existsSync, readFileSync } from 'node:fs'

const base = process.argv[2] ?? 'http://127.0.0.1:3001'
const cookie = process.env.SESSION_COOKIE?.trim()
  || (existsSync('.cookie.tmp') ? readFileSync('.cookie.tmp', 'utf8').trim() : '')

if (!cookie) {
  console.log('⚠️  .cookie.tmp نیست — صفحات پشتِ ورود بررسی نمی‌شوند.')
  console.log('   بساز: npx tsx --conditions=react-server scripts/session-token.ts <شماره> > .cookie.tmp')
}

/**
 * @typedef {{ path: string, needs: string[], auth?: boolean, forbid?: string[] }} Check
 */

/** @type {Check[]} */
const CHECKS = [
  // ── عمومی
  /*
    صفحه‌ی اصلی: تیتر hero، بخش‌های داده‌محور، و هدر و فوتر.

    بررسی‌های قبلی («قیمت واقعی منو»، «بهترین») مربوط به نسخه‌ای بود که جای
    صفحه‌ی اصلی نشسته بود — فهرست داده‌ای بدون هدر و فوتر. حالا ساختار خودِ
    طراحی برگشته و assertها همان را می‌سنجند.
  */
  {
    path: '/',
    needs: [
      'راهنمای انتخاب کافه و غذا در',
      'کافه یا غذای مناسبِ',
      'از چیزی که میل داری شروع کن',
      'کافه‌ها را قبل از رفتن ببین',
      'سه جواب روشن برای یک انتخاب بهتر',
      'محله‌به‌محله',
      'برای کافه‌دارها',
      'پاسخ‌های کوتاه و روشن',
      'ورود | ثبت‌نام',
    ],
    forbid: ['ساختهٔ جوون‌های مشهد', 'green-interior.webp'],
  },
  { path: '/search', needs: ['کافه‌های مشهد', 'فیلترها'] },
  {
    path: '/search?q=پاستا',
    needs: ['پاستا در منوها', 'آیتم واقعی از منوی کافه‌ها', '/item/'],
  },
  {
    path: '/search?q=قهوه',
    needs: ['قهوه در منوها', 'آیتم واقعی از منوی کافه‌ها', '/item/'],
  },
  { path: '/search?f=pasta', needs: ['کافه‌های پاستا'] },
  { path: '/search?dish=alfredo-pasta', needs: ['پاستا آلفردو در منوی کافه‌های مشهد', '/item/'] },
  {
    path: '/dish/alfredo-pasta',
    needs: ['پاستا آلفردو در کافه‌های مشهد', 'مقایسهٔ یک خوراکی', '/item/'],
  },
  {
    path: '/item/97944/پاستا-الفردو',
    needs: ['پاستا آلفردو', 'ارائه‌شده در', 'دیدن منوی کامل کافه'],
  },
  { path: '/search?view=map', needs: ['مجموعه'] },
  { path: '/search?open=1', needs: ['مجموعه'] },
  { path: '/mashhad/vakilabad', needs: ['وکیل‌آباد', 'میانه‌ی قیمت منو'] },
  { path: '/mashhad/faramarz-abbasi', needs: ['فرامرز عباسی'] },
  {
    path: '/cafe/jan-majnoon-lounge',
    needs: ['مجنون لانژ', 'ساعت کاری هفته', '/media/item/', 'nshn.ir/?lat='],
    forbid: [
      // هیچ ارجاعی به CDN بیرونی نباید در HTML باشد.
      'cdn.topmenumarket.com',
      // «اینجا چه پیدا می‌کنید» برداشته شد — نه فقط از دید، از رندر.
      'اینجا چه پیدا می‌کنید',
    ],
  },
  {
    path: '/cafe/blackhorse-hall',
    needs: ['مشاهده منو', 'جست‌وجو در تمام منو', 'دسته‌بندی‌ها', 'نظرها'],
  },
  {
    // منوی بزرگ راموز نباید صفحه را با صدها کارت یک‌جا رندر کند. کنترلِ
    // دسته‌ای و بارگذاری مرحله‌ای باید در HTML نسخهٔ واقعی حاضر باشد.
    path: '/cafe/ramouz-cafe',
    needs: ['مشاهده منو', 'نمای سریع برای دیدن نام و قیمت', 'امروز ۰۶:۳۰–۰۰:۰۰', 'منو ترند', 'نظرها'],
    forbid: ['۵۵:۵۵', '۴۳۳۳ آیتم'],
  },
  {
    path: '/contribute',
    needs: ['مشارکت', 'ساعت کاری', 'ثبت کافه‌ی جدید'],
  },
  { path: '/auth', needs: ['ورود به کو کافه', 'رمز را فراموش کرده‌ام', 'ساخت حساب'] },
  { path: '/sitemap.xml', needs: ['/mashhad/', '/cafe/'] },
  { path: '/robots.txt', needs: ['Disallow'] },
  /*
    استایل نقشه.

    `mashhad` از فهرست برداشته شد: آن نامِ منبعِ **تایل برداریِ** قدیمی بود.
    حالا هر لایه منبعِ `geojson` خودش را دارد که از `/map/` می‌آید. بررسی‌های
    زیر همان معماری را قفل می‌کنند:
      • لایه‌های پایه واقعاً در استایل‌اند
      • داده از مسیر نسبیِ `/map/` می‌آید، نه از یک دامنه‌ی بیرونی
      • مشخصاتِ بارگذاری تنبلِ ساختمان همراه استایل می‌آید
      • `/api/map/tiles` دیگر ساخته نمی‌شود
  */
  {
    path: '/api/map/style?theme=light',
    needs: ['road_major', '/map/road_major.geojson', 'kucafe:lazyBuildings', '"geojson"'],
    forbid: ['https://', '/api/map/tiles'],
  },
  {
    path: '/api/search/suggest?q=پاستا',
    needs: ['"suggestions"', '"type":"facet"', '"type":"item"', '"href":"/item/'],
  },

  // ── پشتِ ورود
  { path: '/profile', needs: ['مشارکت من', 'ذخیره‌شده‌ها'], auth: true },
  { path: '/profile/taste', needs: ['سلیقه‌ی تو', 'قهوه‌ی دمی', 'رژیمی و گیاهی'], auth: true },
  { path: '/profile/submit', needs: ['ثبت کافه‌ی جدید', 'ارسال برای بررسی'], auth: true },
  { path: '/profile/password', needs: ['رمز جدید'], auth: true },
  { path: '/profile/reviews', needs: ['نظرهای من'], auth: true },
  { path: '/cafe/jan-majnoon-lounge', needs: ['امتیاز کلی', 'امتیاز تفکیکی'], auth: true },

  /*
    پنل ادمین. تب‌ها در کلاینت عوض می‌شوند، پس *محتوای* تب تنظیمات در HTML
    اولیه نیست — ولی propهایش هست (در payload RSC). این بررسی همان را می‌سنجد:
    اینکه سرور کل شیء تنظیمات را با کلیدهای درست فرستاده. صحتِ ذخیره و
    اعتبارسنجی در `npm run settings:smoke` سنجیده می‌شود.
  */
  {
    path: '/admin',
    needs: [
      'پنل مدیریت',
      'تنظیمات',
      'عملیات',
      'Asia/Tehran',
      'siteName',
      'stalePriceDays',
      'priceStatsMaxItemPrice',
      'priceStatsExcludeServiceSections',
      'overriddenKeys',
    ],
    auth: true,
  },
  {
    path: '/admin/venue',
    needs: ['مدیریت مجموعه‌ها', 'کدام کافه را می‌خواهید مدیریت کنید؟'],
    auth: true,
  },
  {
    path: '/admin/venue?place=154',
    needs: ['پنل مدیریت مجموعه', 'دسترسی‌ها', 'مسیر تکمیل پروفایل', 'مشاهده صفحه', 'تصاویر', 'QR منو'],
    auth: true,
  },
]

let failures = 0
let checked = 0
const staticAssets = new Set()

for (const check of CHECKS) {
  if (check.auth && !cookie) continue
  checked++

  const label = `${check.path}${check.auth ? ' [نشست]' : ''}`
  try {
    const started = Date.now()
    const response = await fetch(base + check.path, {
      headers: check.auth ? { cookie } : {},
      redirect: 'manual',
    })
    const ms = Date.now() - started

    if (response.status >= 300) {
      console.log(`✗ ${label} — HTTP ${response.status} → ${response.headers.get('location') ?? ''}`)
      failures++
      continue
    }

    const body = await response.text()
    // فقط ۲۰۰ بودن HTML کافی نیست. خرابی رایج هنگام deploy این است که HTML
    // سالم باشد ولی CSS/JS fingerprintشده پاک شده باشد؛ دقیقاً همان چیزی که
    // مرورگر به شکل صفحهٔ سفید و خطای `/_next/static/...` نشان می‌دهد.
    for (const match of body.matchAll(/\/_next\/static\/[^"'\\\s<]+/g)) {
      staticAssets.add(match[0].replaceAll('&amp;', '&'))
    }
    const missing = check.needs.filter((needle) => !body.includes(needle))
    const leaked = (check.forbid ?? []).filter((needle) => body.includes(needle))

    if (missing.length === 0 && leaked.length === 0) {
      console.log(`✓ ${label} — ${(body.length / 1024).toFixed(0)}KB · ${ms}ms`)
    } else {
      failures++
      console.log(`✗ ${label} — ${(body.length / 1024).toFixed(0)}KB`)
      for (const needle of missing) console.log(`    نبود: ${needle}`)
      for (const needle of leaked) console.log(`    نباید باشد: ${needle}`)
    }
  } catch (error) {
    failures++
    console.log(`✗ ${label} — ${error.message}`)
  }
}

let checkedAssets = 0
for (const asset of staticAssets) {
  checkedAssets++
  try {
    const response = await fetch(base + asset, { redirect: 'manual' })
    if (response.status !== 200) {
      failures++
      console.log(`✗ asset — HTTP ${response.status} ${asset}`)
    }
  } catch (error) {
    failures++
    console.log(`✗ asset — ${asset} — ${error.message}`)
  }
}

if (checkedAssets > 0 && failures === 0) {
  console.log(`✓ ${checkedAssets} فایل CSS/JS مشترک صفحات نیز سالم است.`)
}

console.log(
  failures === 0
    ? `\n${checked} صفحه بررسی شد، همه سالم.`
    : `\n${failures} از ${checked} صفحه مشکل دارد.`,
)
process.exit(failures === 0 ? 0 : 1)
