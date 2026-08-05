/**
 * تحلیل فایل منبع `all-cafe-data/cafes_full_latest.json`.
 *
 * این اسکریپت هیچ‌چیزی را تغییر نمی‌دهد — فقط شکل داده را گزارش می‌کند تا
 * نگاشت واردکردن (importer) و واژگان فیلترها بر پایه‌ی *داده‌ی واقعی* ساخته
 * شود، نه حدس. خروجی در `task/01-data-audit/` نوشته می‌شود.
 *
 *   npx tsx scripts/analyze-source.ts
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = resolve(process.cwd(), 'all-cafe-data/cafes_full_latest.json')
const OUT_DIR = resolve(process.cwd(), 'task/01-data-audit')

// ── شکل خام رکورد منبع (کلیدهای فارسی) ───────────────────────────────

interface RawItem {
  'نام'?: string
  'نام انگلیسی'?: string
  'توضیحات'?: { description?: string } | string | null
  'قیمت (تومان)'?: number | null
  'موجود است'?: boolean
  'ویژه است'?: boolean
  'تصویر'?: string | null
  'شناسه'?: number
}

interface RawSection {
  'دسته‌بندی'?: string
  'توضیحات'?: string | null
  'تصویر'?: string | null
  'آیتم‌ها'?: RawItem[]
}

interface RawCafe {
  'شناسه': number
  'نام مجموعه': string
  'نام انگلیسی': string
  'یوزرنیم': string
  'لینک منو': string
  'شماره تماس‌ها': string
  'اینستاگرام': string
  'سایر شبکه‌های اجتماعی': string
  'آدرس متنی': string
  'عرض جغرافیایی (lat)': number | null
  'طول جغرافیایی (lng)': number | null
  'ساعات کاری': string
  'درباره': string
  'لوگو': string
  'منو': RawSection[]
}

const cafes: RawCafe[] = JSON.parse(readFileSync(SOURCE, 'utf8'))

const lines: string[] = []
const say = (s = '') => {
  lines.push(s)
}

function counter(): Map<string, number> {
  return new Map<string, number>()
}
function bump(m: Map<string, number>, k: string, n = 1) {
  m.set(k, (m.get(k) ?? 0) + n)
}
function top(m: Map<string, number>, n: number): [string, number][] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}
function pct(n: number, of: number): string {
  return `${((n / of) * 100).toFixed(1)}٪`
}

say(`# گزارش تحلیل داده‌ی منبع`)
say()
say(`فایل: \`all-cafe-data/cafes_full_latest.json\``)
say(`تعداد مجموعه: **${cafes.length}**`)
say()

// ── ۱. پوشش فیلدها ───────────────────────────────────────────────────

say(`## ۱. پوشش فیلدها`)
say()
say(`| فیلد | پرشده | پوشش |`)
say(`| --- | --- | --- |`)
const FIELDS: (keyof RawCafe)[] = [
  'شناسه',
  'نام مجموعه',
  'نام انگلیسی',
  'یوزرنیم',
  'لینک منو',
  'شماره تماس‌ها',
  'اینستاگرام',
  'سایر شبکه‌های اجتماعی',
  'آدرس متنی',
  'عرض جغرافیایی (lat)',
  'طول جغرافیایی (lng)',
  'ساعات کاری',
  'درباره',
  'لوگو',
  'منو',
]
for (const f of FIELDS) {
  const n = cafes.filter((c) => {
    const v = c[f]
    if (v === null || v === undefined || v === '') return false
    if (Array.isArray(v)) return v.length > 0
    return true
  }).length
  say(`| ${f} | ${n} | ${pct(n, cafes.length)} |`)
}
say()

// ── ۲. یکتایی شناسه و نام ────────────────────────────────────────────

say(`## ۲. یکتایی`)
say()
const ids = counter()
const usernames = counter()
const names = counter()
for (const c of cafes) {
  bump(ids, String(c['شناسه']))
  bump(usernames, c['یوزرنیم'] ?? '')
  bump(names, (c['نام مجموعه'] ?? '').trim())
}
const dupIds = [...ids].filter(([, n]) => n > 1)
const dupUsers = [...usernames].filter(([, n]) => n > 1)
const dupNames = [...names].filter(([, n]) => n > 1)
say(`- شناسه‌ی یکتا: ${ids.size} / ${cafes.length} — تکراری: ${dupIds.length}`)
say(`- یوزرنیم یکتا: ${usernames.size} — تکراری: ${dupUsers.length}`)
say(`- نام یکتا: ${names.size} — تکراری: ${dupNames.length}`)
if (dupNames.length) {
  say()
  say(`نام‌های تکراری (باید در slug با پسوند تفکیک شوند):`)
  for (const [n, c] of dupNames) say(`  - ${n} × ${c}`)
}
say()

// ── ۳. مختصات جغرافیایی ──────────────────────────────────────────────

say(`## ۳. مختصات`)
say()
const withCoords = cafes.filter(
  (c) =>
    typeof c['عرض جغرافیایی (lat)'] === 'number' &&
    typeof c['طول جغرافیایی (lng)'] === 'number',
)
const lats = withCoords.map((c) => c['عرض جغرافیایی (lat)'] as number)
const lngs = withCoords.map((c) => c['طول جغرافیایی (lng)'] as number)
say(`- دارای مختصات: ${withCoords.length} (${pct(withCoords.length, cafes.length)})`)
say(`- بدون مختصات: ${cafes.length - withCoords.length} ← روی نقشه نمی‌آیند`)
say(
  `- محدوده‌ی lat: ${Math.min(...lats).toFixed(5)} .. ${Math.max(...lats).toFixed(5)}`,
)
say(
  `- محدوده‌ی lng: ${Math.min(...lngs).toFixed(5)} .. ${Math.max(...lngs).toFixed(5)}`,
)
// مشهد تقریباً lat 36.20–36.45 و lng 59.35–59.75
const outside = withCoords.filter((c) => {
  const la = c['عرض جغرافیایی (lat)'] as number
  const ln = c['طول جغرافیایی (lng)'] as number
  return la < 36.1 || la > 36.55 || ln < 59.2 || ln > 59.85
})
say(`- خارج از کادر مشهد: ${outside.length}`)
for (const c of outside.slice(0, 15)) {
  say(
    `  - ${c['نام مجموعه']} → ${c['عرض جغرافیایی (lat)']}, ${c['طول جغرافیایی (lng)']}`,
  )
}
say()

// ── ۴. ساعات کاری ────────────────────────────────────────────────────

say(`## ۴. ساعات کاری`)
say()
const hoursShapes = counter()
const dayTokens = counter()
const timeRe = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/
let hoursParsable = 0
let hoursOddRanges = 0
const oddSamples: string[] = []
for (const c of cafes) {
  const raw = (c['ساعات کاری'] ?? '').trim()
  if (!raw) {
    bump(hoursShapes, '(خالی)')
    continue
  }
  const parts = raw.split('|').map((s) => s.trim())
  let ok = true
  for (const p of parts) {
    const m = p.match(/^([^:]+):\s*(.+)$/)
    if (!m) {
      ok = false
      if (oddSamples.length < 12) oddSamples.push(p)
      continue
    }
    bump(dayTokens, m[1].trim())
    const range = m[2].trim().replace(/\s/g, '')
    if (!timeRe.test(range)) {
      hoursOddRanges++
      if (oddSamples.length < 12) oddSamples.push(p)
      ok = false
    }
  }
  bump(hoursShapes, `${parts.length} روز`)
  if (ok) hoursParsable++
}
say(`- کاملاً قابل تجزیه: ${hoursParsable} / ${cafes.length}`)
say(`- بازه‌های غیراستاندارد: ${hoursOddRanges}`)
say(`- توکن‌های روز: ${[...dayTokens.keys()].join(' · ')}`)
say(`- تعداد روزهای ذکرشده: ${top(hoursShapes, 12).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
if (oddSamples.length) {
  say(`- نمونه‌ی موارد نامتعارف:`)
  for (const s of oddSamples) say(`  - \`${s}\``)
}
say()

// ── ۵. تماس و شبکه‌های اجتماعی ───────────────────────────────────────

say(`## ۵. تماس و شبکه‌ها`)
say()
const phoneShapes = counter()
let multiPhone = 0
for (const c of cafes) {
  const raw = (c['شماره تماس‌ها'] ?? '').trim()
  if (!raw) continue
  const parts = raw.split(/[,،\/|؛;]+/).map((s) => s.trim()).filter(Boolean)
  if (parts.length > 1) multiPhone++
  for (const p of parts) {
    const digits = p.replace(/\D/g, '')
    if (/^09\d{9}$/.test(digits)) bump(phoneShapes, 'موبایل ۱۱رقمی')
    else if (/^0\d{10}$/.test(digits)) bump(phoneShapes, 'ثابت ۱۱رقمی')
    else if (/^051\d{8}$/.test(digits)) bump(phoneShapes, 'مشهد با کد')
    else if (digits.length === 8) bump(phoneShapes, 'ثابت ۸رقمی (بدون کد)')
    else bump(phoneShapes, `سایر (${digits.length} رقم)`)
  }
}
say(`- الگوهای شماره: ${top(phoneShapes, 10).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
say(`- چند شماره‌ای: ${multiPhone}`)
const igShapes = counter()
for (const c of cafes) {
  const raw = (c['اینستاگرام'] ?? '').trim()
  if (!raw) continue
  if (raw.startsWith('http')) bump(igShapes, 'با پروتکل')
  else if (raw.startsWith('instagram.com')) bump(igShapes, 'instagram.com/…')
  else if (raw.startsWith('@')) bump(igShapes, '@handle')
  else bump(igShapes, 'سایر')
}
say(`- الگوهای اینستاگرام: ${top(igShapes, 6).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
const socialKinds = counter()
for (const c of cafes) {
  const raw = (c['سایر شبکه‌های اجتماعی'] ?? '').trim()
  if (!raw) continue
  for (const seg of raw.split(/[|\n]/)) {
    const label = seg.split(':')[0]?.trim()
    if (label) bump(socialKinds, label)
  }
}
say(`- برچسب‌های «سایر شبکه‌ها»: ${top(socialKinds, 15).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
say()

// ── ۶. منو ───────────────────────────────────────────────────────────

say(`## ۶. منو`)
say()
let sectionCount = 0
let itemCount = 0
let itemsWithImage = 0
let itemsWithPrice = 0
let itemsAvailable = 0
let itemsFeatured = 0
let itemsWithDesc = 0
const prices: number[] = []
const sectionNames = counter()
const itemNames = counter()
const imageHosts = counter()
const imageExts = counter()
const allImageUrls = new Set<string>()
const sectionsPerCafe: number[] = []
const itemsPerCafe: number[] = []
let cafesWithoutMenu = 0

for (const c of cafes) {
  const menu = c['منو'] ?? []
  if (menu.length === 0) cafesWithoutMenu++
  sectionsPerCafe.push(menu.length)
  let n = 0
  sectionCount += menu.length
  for (const s of menu) {
    bump(sectionNames, (s['دسته‌بندی'] ?? '').trim())
    if (s['تصویر']) allImageUrls.add(s['تصویر'] as string)
    const items = s['آیتم‌ها'] ?? []
    n += items.length
    itemCount += items.length
    for (const it of items) {
      const nm = (it['نام'] ?? '').trim()
      if (nm) bump(itemNames, nm)
      if (it['تصویر']) {
        itemsWithImage++
        allImageUrls.add(it['تصویر'] as string)
        try {
          const u = new URL(it['تصویر'] as string)
          bump(imageHosts, u.host)
          const ext = u.pathname.split('.').pop() ?? '?'
          bump(imageExts, ext.toLowerCase())
        } catch {
          bump(imageHosts, '(نامعتبر)')
        }
      }
      const p = it['قیمت (تومان)']
      if (typeof p === 'number' && p > 0) {
        itemsWithPrice++
        prices.push(p)
      }
      if (it['موجود است']) itemsAvailable++
      if (it['ویژه است']) itemsFeatured++
      const d = it['توضیحات']
      const dtext = typeof d === 'string' ? d : (d?.description ?? '')
      if (dtext && dtext.replace(/<[^>]*>/g, '').trim()) itemsWithDesc++
    }
  }
  itemsPerCafe.push(n)
}

for (const c of cafes) if (c['لوگو']) allImageUrls.add(c['لوگو'])

prices.sort((a, b) => a - b)
const q = (p: number) => prices[Math.min(prices.length - 1, Math.floor(prices.length * p))]

say(`- بدون منو: ${cafesWithoutMenu} مجموعه`)
say(`- دسته‌بندی: ${sectionCount} (میانگین ${(sectionCount / cafes.length).toFixed(1)} در هر مجموعه)`)
say(`- آیتم: ${itemCount} (میانگین ${(itemCount / cafes.length).toFixed(1)})`)
say(`- بیشترین آیتم در یک مجموعه: ${Math.max(...itemsPerCafe)}`)
say(`- آیتم با تصویر: ${itemsWithImage} (${pct(itemsWithImage, itemCount)})`)
say(`- آیتم با قیمت > ۰: ${itemsWithPrice} (${pct(itemsWithPrice, itemCount)})`)
say(`- آیتم موجود: ${itemsAvailable} · ویژه: ${itemsFeatured} · با توضیح: ${itemsWithDesc}`)
say(`- نام دسته‌بندی یکتا: **${sectionNames.size}** ← نیاز به نرمال‌سازی به واژگان قابل فیلتر`)
say(`- نام آیتم یکتا: **${itemNames.size}**`)
say()
say(`### توزیع قیمت (تومان)`)
say()
say(`| صدک | قیمت |`)
say(`| --- | --- |`)
for (const [label, p] of [
  ['کمینه', 0],
  ['۵٪', 0.05],
  ['۱۰٪', 0.1],
  ['۲۵٪', 0.25],
  ['میانه', 0.5],
  ['۷۵٪', 0.75],
  ['۹۰٪', 0.9],
  ['۹۵٪', 0.95],
  ['۹۹٪', 0.99],
] as [string, number][]) {
  say(`| ${label} | ${(p === 0 ? prices[0] : q(p)).toLocaleString('fa-IR')} |`)
}
say(`| بیشینه | ${prices[prices.length - 1].toLocaleString('fa-IR')} |`)
say()
const suspiciousLow = prices.filter((p) => p < 1000).length
const suspiciousHigh = prices.filter((p) => p > 20_000_000).length
say(`- قیمت مشکوکِ پایین (<۱۰۰۰ تومان): ${suspiciousLow} ← احتمالاً واحدشان تومان نیست`)
say(`- قیمت مشکوکِ بالا (>۲۰ میلیون): ${suspiciousHigh} ← احتمالاً سرویس/پکیج`)
say()

// ── ۷. تصاویر ────────────────────────────────────────────────────────

say(`## ۷. تصاویر (باید لوکال شوند)`)
say()
say(`- کل URL یکتا: **${allImageUrls.size}**`)
say(`- میزبان‌ها: ${top(imageHosts, 8).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
say(`- پسوندها: ${top(imageExts, 8).map(([k, v]) => `${k}=${v}`).join(' · ')}`)
say()

// ── ۸. فهرست دسته‌بندی‌ها برای طراحی واژگان ──────────────────────────

say(`## ۸. پرتکرارترین دسته‌بندی‌ها (۱۵۰ مورد)`)
say()
say(`ورودی طراحی واژگان — نگاشت این‌ها به facet قابل فیلتر در تسک ۰۵.`)
say()
say(`| تکرار | نام دسته |`)
say(`| --- | --- |`)
for (const [k, v] of top(sectionNames, 150)) say(`| ${v} | ${k} |`)
say()

say(`## ۹. پرتکرارترین نام آیتم‌ها (۱۵۰ مورد)`)
say()
say(`ورودی ساخت «ایندکس غذا» برای فیلترهایی مثل «بهترین پاستا نزدیک من».`)
say()
say(`| تکرار | نام آیتم |`)
say(`| --- | --- |`)
for (const [k, v] of top(itemNames, 150)) say(`| ${v} | ${k} |`)
say()

// ── ۹. درباره ────────────────────────────────────────────────────────

say(`## ۱۰. متن «درباره»`)
say()
const aboutLens: number[] = []
let aboutHtml = 0
for (const c of cafes) {
  const raw = (c['درباره'] ?? '').trim()
  if (!raw) continue
  if (/<[a-z][^>]*>/i.test(raw)) aboutHtml++
  aboutLens.push(raw.replace(/<[^>]*>/g, '').trim().length)
}
aboutLens.sort((a, b) => a - b)
say(`- دارای متن: ${aboutLens.length} · شامل HTML: ${aboutHtml} ← باید پاک‌سازی شود`)
say(
  `- طول متنِ خالص: میانه ${aboutLens[Math.floor(aboutLens.length / 2)] ?? 0} · بیشینه ${aboutLens[aboutLens.length - 1] ?? 0}`,
)
say()

// ── خروجی ────────────────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'REPORT.md'), `${lines.join('\n')}\n`, 'utf8')

// دو فایل کمکی برای طراحی واژگان (کامل، نه بریده)
writeFileSync(
  resolve(OUT_DIR, 'section-names.tsv'),
  [...sectionNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}\t${k}`)
    .join('\n'),
  'utf8',
)
writeFileSync(
  resolve(OUT_DIR, 'item-names.tsv'),
  [...itemNames.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v}\t${k}`)
    .join('\n'),
  'utf8',
)
writeFileSync(
  resolve(OUT_DIR, 'image-urls.txt'),
  [...allImageUrls].join('\n'),
  'utf8',
)

console.log(`نوشته شد: ${OUT_DIR}/REPORT.md`)
console.log(`  section-names.tsv (${sectionNames.size})`)
console.log(`  item-names.tsv (${itemNames.size})`)
console.log(`  image-urls.txt (${allImageUrls.size})`)
