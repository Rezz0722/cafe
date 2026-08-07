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
const cookie = existsSync('.cookie.tmp')
  ? readFileSync('.cookie.tmp', 'utf8').trim()
  : ''

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
    صفحه‌ی اصلی: تیتر hero، هر شش بخش، و هدر و فوتر.

    بررسی‌های قبلی («قیمت واقعی منو»، «بهترین») مربوط به نسخه‌ای بود که جای
    صفحه‌ی اصلی نشسته بود — فهرست داده‌ای بدون هدر و فوتر. حالا ساختار خودِ
    طراحی برگشته و assertها همان را می‌سنجند.
  */
  {
    path: '/',
    needs: [
      'امروز کجا بریم؟',
      'کافهٔ خودت',
      'فیلترهای پرکاربرد',
      'کافه‌های منتخب',
      'مشاهده',
      'بگو حالت چطوره',
      'می‌خوای کار کنی؟',
      'وکیل‌آباد',
      'ترجیح می‌دی روی نقشه ببینی؟',
      'یک پروژهٔ مردمی',
      'ورود | ثبت‌نام',
      'ساختهٔ جوون‌های مشهد',
    ],
  },
  { path: '/search', needs: ['کافه‌های مشهد', 'فیلترها'] },
  { path: '/search?f=pasta', needs: ['کافه‌های پاستا'] },
  { path: '/search?dish=alfredo-pasta', needs: ['بهترین پاستا آلفردو'] },
  { path: '/search?view=map', needs: ['مجموعه'] },
  { path: '/search?open=1', needs: ['مجموعه'] },
  { path: '/mashhad/vakilabad', needs: ['وکیل‌آباد', 'میانه‌ی قیمت منو'] },
  { path: '/mashhad/faramarz-abbasi', needs: ['فرامرز عباسی'] },
  {
    path: '/cafe/jan-majnoon-lounge',
    needs: ['مجنون لانژ', 'ساعت کاری هفته', '/media/item/', 'neshan.org/maps/routing'],
    forbid: [
      // هیچ ارجاعی به CDN بیرونی نباید در HTML باشد.
      'cdn.topmenumarket.com',
      // «اینجا چه پیدا می‌کنید» برداشته شد — نه فقط از دید، از رندر.
      'اینجا چه پیدا می‌کنید',
    ],
  },
  { path: '/cafe/blackhorse-hall', needs: ['در منو بگرد'] },
  {
    path: '/contribute',
    needs: ['مشارکت', 'ساعت کاری', 'ثبت کافه‌ی جدید'],
  },
  { path: '/auth', needs: ['ورود یا ثبت‌نام', 'ساخت حساب با رمز'] },
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
      'overriddenKeys',
    ],
    auth: true,
  },
]

let failures = 0
let checked = 0

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

console.log(
  failures === 0
    ? `\n${checked} صفحه بررسی شد، همه سالم.`
    : `\n${failures} از ${checked} صفحه مشکل دارد.`,
)
process.exit(failures === 0 ? 0 : 1)
