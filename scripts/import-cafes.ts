/**
 * import کافه‌ها از `Mashhad_Cafes_Database.json` به `src/data/places.generated.json`.
 *
 *   npm run import:cafes
 *
 * خروجی قابل commit است — یعنی build نیازی به فایل ورودی خام ندارد و
 * تغییرات داده در git قابل مرور است.
 *
 * فایلِ کافه‌های افزوده‌شده از پنل ادمین (`places.custom.json`) دست‌نخورده
 * می‌ماند؛ این اسکریپت فقط فایل generated را بازنویسی می‌کند.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { importPlaces, type RawCafe } from '../src/core/import/importPlaces.ts'

const ROOT = resolve(import.meta.dirname, '..')
const INPUT = resolve(ROOT, 'Mashhad_Cafes_Database.json')
const OUTPUT = resolve(ROOT, 'src/data/places.generated.json')

if (!existsSync(INPUT)) {
  console.error(`✗ فایل ورودی پیدا نشد: ${INPUT}`)
  process.exit(1)
}

const raw = JSON.parse(readFileSync(INPUT, 'utf8')) as RawCafe[]
const { places, issues, stats } = importPlaces(raw)

writeFileSync(OUTPUT, `${JSON.stringify(places, null, 2)}\n`, 'utf8')

// ── گزارش ────────────────────────────────────────────────────────────

const rejected = issues.filter((i) => i.severity === 'rejected')
const warnings = issues.filter((i) => i.severity === 'warning')

console.log('')
console.log('══ import کافه‌ها ══')
console.log(`  ورودی            ${stats.total}`)
console.log(`  وارد شد          ${stats.imported}`)
console.log(`  رد شد            ${stats.rejected}`)
console.log('')
console.log(`  ویژگی نگاشت‌شده   ${stats.attributesMapped}`)
console.log(`  highlight نگه‌داشته ${stats.highlightsKept}`)
console.log(`  تلفن حذف‌شده      ${stats.phonesDropped}`)
console.log(`  بدون مختصات دقیق ${stats.withoutCoords}  (مرکز محله استفاده شد)`)

if (rejected.length) {
  console.log('')
  console.log(`── رد شده (${rejected.length}) ──`)
  for (const i of rejected) console.log(`  [${i.rawId}] ${i.name}: ${i.reason}`)
}

if (warnings.length) {
  console.log('')
  console.log(`── هشدار (${warnings.length}) ──`)
  for (const i of warnings) console.log(`  [${i.rawId}] ${i.name}: ${i.reason}`)
}

console.log('')
console.log(`✓ نوشته شد: ${OUTPUT}`)
console.log('')
