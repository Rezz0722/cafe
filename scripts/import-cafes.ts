/**
 * واردکردن `all-cafe-data/cafes_full_latest.json` به MySQL.
 *
 *   npm run import:cafes
 *
 * ⚠️  **همه‌ی مکان‌های موجود را پاک می‌کند** و از نو می‌نویسد. جدول `media`
 *     دست‌نخورده می‌ماند، پس ۱۴هزار تصویر دانلودشده از دست نمی‌روند.
 *
 * گزارش کامل در `task/04-import/REPORT.md` نوشته می‌شود — نه فقط چاپ در
 * ترمینال، چون این گزارش سند تصمیم‌های داده است و باید قابل رهگیری بماند.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importCafes, summarizeHoursWarnings } from '../src/core/import/importCafes'
import { getDataPolicy } from '../src/core/settings/policies'
import { closeDb, getDb } from '../src/db/connection'

const OUT_DIR = resolve(process.cwd(), 'task/04-import')

function faNumber(value: number): string {
  return value.toLocaleString('fa-IR')
}

async function main() {
  const started = Date.now()
  const db = getDb()

  /*
    سیاست از جدول `setting` خوانده می‌شود، نه از ثابت‌های کد: اگر مدیر مرزهای
    رده‌ی قیمت یا کادر شهر را در پنل عوض کرده باشد، ایمپورت بعدی باید همان را
    ببیند — وگرنه رده‌ای که ایمپورت می‌نویسد با آنچه پنل نشان می‌دهد نمی‌خواند.
  */
  const policy = await getDataPolicy()
  const report = await importCafes(db, {
    log: (message) => console.log(`  ${message}`),
    policy,
  })
  const seconds = ((Date.now() - started) / 1000).toFixed(1)

  console.log('\n══ خلاصه ══')
  console.log(`مکان: ${report.places} · دسته: ${report.sections} · آیتم: ${report.items}`)
  console.log(`تلفن: ${report.phones} · شبکه: ${report.socials} · شیفت ساعت: ${report.hourShifts}`)
  console.log(`آیتم با تصویر: ${report.itemsWithImage} · بی‌قیمت: ${report.itemsWithoutPrice}`)
  console.log(`رسانه‌ی وصل‌شده: ${report.linkedMedia} · پیدانشده: ${report.missingMedia}`)
  console.log(`نوع: ${JSON.stringify(report.byKind)}`)
  console.log(`مختصات: ${JSON.stringify(report.byGeo)}`)
  console.log(`رده‌ی قیمت: ${JSON.stringify(report.byTier)}`)
  console.log(`اصلاح واحد قیمت: ${report.unitFixed.length} مجموعه`)
  console.log(`فروشگاه (draft): ${report.shops.length}`)
  console.log(`بدون محله: ${report.withoutDistrict.length}`)
  console.log(`هشدار ساعت: ${report.hoursWarnings.length}`)
  console.log(`زمان: ${seconds} ثانیه`)

  // ── نوشتن گزارش
  const hoursSummary = summarizeHoursWarnings(report.hoursWarnings)
  const lines: string[] = []
  const say = (s = '') => lines.push(s)

  say('# تسک ۰۴ — واردکردن داده در MySQL ✅')
  say()
  say(`اجرا در ${seconds} ثانیه از \`all-cafe-data/cafes_full_latest.json\`.`)
  say()
  say('## آنچه وارد شد')
  say()
  say('| موجودیت | تعداد |')
  say('| --- | --- |')
  say(`| مکان | ${faNumber(report.places)} |`)
  say(`| دسته‌بندی منو | ${faNumber(report.sections)} |`)
  say(`| آیتم منو | ${faNumber(report.items)} |`)
  say(`| شماره تلفن | ${faNumber(report.phones)} |`)
  say(`| لینک شبکه‌ی اجتماعی | ${faNumber(report.socials)} |`)
  say(`| شیفت ساعت کاری | ${faNumber(report.hourShifts)} |`)
  say(`| آیتم با تصویر لوکال | ${faNumber(report.itemsWithImage)} |`)
  say(`| آیتم بدون قیمت معتبر | ${faNumber(report.itemsWithoutPrice)} |`)
  say()
  say('## توزیع‌ها')
  say()
  say('### نوع مجموعه')
  say()
  say('| نوع | تعداد |')
  say('| --- | --- |')
  for (const [kind, count] of Object.entries(report.byKind).sort((a, b) => b[1] - a[1])) {
    say(`| ${kind} | ${faNumber(count)} |`)
  }
  say()
  say('### وضعیت مختصات')
  say()
  say('| وضعیت | تعداد | معنی |')
  say('| --- | --- | --- |')
  const geoMeaning: Record<string, string> = {
    ok: 'داخل کادر مشهد — روی نقشه و در «نزدیک من»',
    out_of_area: 'مختصات معتبر ولی بیرون مشهد — صفحه دارد، روی نقشه نه',
    missing: 'بدون مختصات — در صف کیفیت داده',
  }
  for (const [status, count] of Object.entries(report.byGeo)) {
    say(`| ${status} | ${faNumber(count)} | ${geoMeaning[status] ?? ''} |`)
  }
  say()
  say('### رده‌ی قیمت (از میانه‌ی منو)')
  say()
  say('| رده | تعداد |')
  say('| --- | --- |')
  const tierLabel: Record<string, string> = {
    '1': '۱ — ارزان (میانه تا ۲۵۰ هزار)',
    '2': '۲ — متوسط (۲۵۰ تا ۴۰۰ هزار)',
    '3': '۳ — گران (بالای ۴۰۰ هزار)',
  }
  for (const [tier, count] of Object.entries(report.byTier).sort()) {
    say(`| ${tierLabel[tier] ?? tier} | ${faNumber(count)} |`)
  }
  say()
  say('## اصلاح‌های داده')
  say()
  say(`### اصلاح واحد قیمت — ${report.unitFixed.length} مجموعه`)
  say()
  say('قیمت‌ها به «هزار تومان» نوشته شده بودند. تشخیص از میانه‌ی منو، و ضرب')
  say('فقط روی آیتم‌هایی که خودشان زیر آستانه‌اند (چون بعضی منوها واحد قاطی')
  say('دارند). این مجموعه‌ها در دیتابیس با `price_unit_fixed = 1` علامت خورده‌اند:')
  say()
  for (const name of report.unitFixed) say(`- ${name}`)
  say()
  say(`### مجموعه‌های غیرکافه — ${report.shops.length} مورد (وضعیت \`draft\`)`)
  say()
  say('فایل منبع خروجی یک پلتفرم منوی عمومی است، نه فقط کافه. این‌ها **حذف')
  say('نشدند** ولی منتشر هم نشدند تا در سایت عمومی به‌عنوان کافه دیده نشوند.')
  say('در پنل ادمین قابل بازبینی و انتشار دستی هستند.')
  say()
  if (report.shops.length > 0) {
    say('| نام | slug | دلیل |')
    say('| --- | --- | --- |')
    for (const shop of report.shops) {
      say(`| ${shop.name} | \`${shop.slug}\` | ${shop.reason} |`)
    }
  } else {
    say('_موردی یافت نشد._')
  }
  say()
  say('## داده‌ی ناقص که باید پر شود')
  say()
  say(`### بدون محله — ${report.withoutDistrict.length} مجموعه`)
  say()
  say('نه در آدرس متنی نام محله‌ی شناخته‌شده بود، نه مختصاتشان به مرکز محله‌ای')
  say('نزدیک‌تر از ۴ کیلومتر بود. این‌ها در صفحه‌بندی محله‌ای دیده نمی‌شوند.')
  say()
  for (const name of report.withoutDistrict.slice(0, 40)) say(`- ${name}`)
  if (report.withoutDistrict.length > 40) {
    say(`- … و ${report.withoutDistrict.length - 40} مورد دیگر`)
  }
  say()
  say(`### منوی خالی — ${report.emptyMenu.length} مجموعه`)
  say()
  for (const name of report.emptyMenu) say(`- ${name}`)
  say()
  say(`### هشدارهای ساعت کاری — ${report.hoursWarnings.length} مورد`)
  say()
  say('این‌ها **حدس زده نشدند**. یک ساعتِ اشتباه از یک ساعتِ خالی بدتر است، چون')
  say('کاربر با اعتماد به آن راه می‌افتد و به در بسته می‌رسد.')
  say()
  if (hoursSummary.length > 0) {
    say('| تعداد | شکل هشدار | نمونه |')
    say('| --- | --- | --- |')
    for (const group of hoursSummary) {
      say(`| ${faNumber(group.count)} | ${group.warning} | ${group.example} |`)
    }
  } else {
    say('_موردی نبود._')
  }
  say()
  say('## وضعیت رسانه')
  say()
  say(`- ارجاع وصل‌شده به جدول \`media\`: ${faNumber(report.linkedMedia)}`)
  say(`- ارجاع بدون ردیف رسانه: ${faNumber(report.missingMedia)}`)
  say()
  if (report.missingMedia > 0) {
    say('ارجاعِ پیدانشده یعنی آن آدرس در `media` ثبت نشده. با اجرای')
    say('`npx tsx scripts/media-seed.ts` و بعد ایمپورت دوباره درست می‌شود.')
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(resolve(OUT_DIR, 'REPORT.md'), `${lines.join('\n')}\n`, 'utf8')
  console.log('\nگزارش نوشته شد: task/04-import/REPORT.md')

  await closeDb()
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
