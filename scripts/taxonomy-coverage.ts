/**
 * سنجش پوشش واژگان روی داده‌ی واقعی.
 *
 * قبل از اینکه facetها را در دیتابیس بنویسیم، باید بدانیم چند درصد از ۳٬۶۰۱
 * دسته و ۱۹٬۳۸۶ آیتم اصلاً نگاشت می‌شوند. اگر پوشش پایین باشد، فیلترها
 * نصفه‌ونیمه کار می‌کنند و کاربر فکر می‌کند کافه‌ای وجود ندارد.
 *
 * نام‌های نگاشت‌نشده هم چاپ می‌شوند — ورودی مستقیم بهبود واژگان.
 *
 *   npx tsx scripts/taxonomy-coverage.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSourceCafes } from '../src/core/import/source'
import { FACET_BY_ID, DISH_BY_SLUG, matchDish, matchFacet } from '../src/core/taxonomy/menuTaxonomy'
import { cleanLine } from '../src/core/import/normalize'

const OUT_DIR = resolve(process.cwd(), 'task/05-facets')

function pct(part: number, total: number): string {
  return total === 0 ? '—' : `${((part / total) * 100).toFixed(1)}٪`
}

const cafes = readSourceCafes()

let sectionTotal = 0
let sectionMatched = 0
let itemTotal = 0
let itemMatched = 0

const facetSectionCount = new Map<string, number>()
const facetItemCount = new Map<string, number>()
const facetPlaces = new Map<string, Set<number>>()
const dishItemCount = new Map<string, number>()
const dishPlaces = new Map<string, Set<number>>()
const unmatchedSections = new Map<string, number>()
const unmatchedItems = new Map<string, number>()

const bump = (map: Map<string, number>, key: string, n = 1) => map.set(key, (map.get(key) ?? 0) + n)
const addPlace = (map: Map<string, Set<number>>, key: string, placeId: number) => {
  const set = map.get(key)
  if (set) set.add(placeId)
  else map.set(key, new Set([placeId]))
}

for (const cafe of cafes) {
  const placeId = cafe['شناسه']
  for (const section of cafe['منو'] ?? []) {
    const sectionName = cleanLine(section['دسته‌بندی'])
    sectionTotal++
    const facetId = matchFacet(sectionName)
    if (facetId) {
      sectionMatched++
      bump(facetSectionCount, facetId)
      addPlace(facetPlaces, facetId, placeId)
    } else if (sectionName) {
      bump(unmatchedSections, sectionName)
    }

    for (const item of section['آیتم‌ها'] ?? []) {
      const itemName = cleanLine(item['نام'])
      if (!itemName) continue
      itemTotal++
      if (facetId) bump(facetItemCount, facetId)
      const dishSlug = matchDish(itemName, facetId)
      if (dishSlug) {
        itemMatched++
        bump(dishItemCount, dishSlug)
        addPlace(dishPlaces, dishSlug, placeId)
      } else {
        bump(unmatchedItems, itemName)
      }
    }
  }
}

const lines: string[] = []
const say = (s = '') => lines.push(s)

say('# پوشش واژگان روی داده‌ی واقعی')
say()
say('| سنجه | تعداد | پوشش |')
say('| --- | --- | --- |')
say(`| دسته‌بندی منو | ${sectionTotal} | — |`)
say(`| دسته‌ی نگاشت‌شده به facet | ${sectionMatched} | **${pct(sectionMatched, sectionTotal)}** |`)
say(`| آیتم منو | ${itemTotal} | — |`)
say(`| آیتم نگاشت‌شده به دیش | ${itemMatched} | **${pct(itemMatched, itemTotal)}** |`)
say()
say('نگاشت‌نشدنِ یک آیتم مشکل نیست: خیلی از آیتم‌ها یکتا و خاص یک کافه‌اند')
say('(«آفرینش»، «کولاژ»). آنچه مهم است، پوشش **دسته‌ها** و پوشش دیش‌های')
say('پرتکرار است — همان‌ها که کاربر جست‌وجو می‌کند.')
say()

say('## facetها — چند کافه هرکدام را دارند')
say()
say('| facet | برچسب | کافه | دسته | آیتم |')
say('| --- | --- | --- | --- | --- |')
const facetRows = [...facetPlaces.entries()]
  .map(([id, places]) => ({
    id,
    label: FACET_BY_ID.get(id)?.labelFa ?? id,
    places: places.size,
    sections: facetSectionCount.get(id) ?? 0,
    items: facetItemCount.get(id) ?? 0,
  }))
  .sort((a, b) => b.places - a.places)
for (const row of facetRows) {
  say(`| \`${row.id}\` | ${row.label} | **${row.places}** | ${row.sections} | ${row.items} |`)
}
say()

say('## دیش‌ها — پایه‌ی «بهترین X نزدیک من»')
say()
say('| دیش | کافه | آیتم |')
say('| --- | --- | --- |')
const dishRows = [...dishPlaces.entries()]
  .map(([slug, places]) => ({
    slug,
    label: DISH_BY_SLUG.get(slug)?.nameFa ?? slug,
    places: places.size,
    items: dishItemCount.get(slug) ?? 0,
  }))
  .sort((a, b) => b.places - a.places)
for (const row of dishRows) {
  say(`| ${row.label} (\`${row.slug}\`) | **${row.places}** | ${row.items} |`)
}
say()

say(`## دسته‌های نگاشت‌نشده — ${unmatchedSections.size} نام یکتا`)
say()
say('| تکرار | نام دسته |')
say('| --- | --- |')
for (const [name, count] of [...unmatchedSections].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
  say(`| ${count} | ${name} |`)
}
say()

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(resolve(OUT_DIR, 'COVERAGE.md'), `${lines.join('\n')}\n`, 'utf8')
writeFileSync(
  resolve(OUT_DIR, 'unmatched-items.tsv'),
  [...unmatchedItems.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${count}\t${name}`)
    .join('\n'),
  'utf8',
)

console.log(`دسته: ${sectionMatched}/${sectionTotal} (${pct(sectionMatched, sectionTotal)})`)
console.log(`آیتم: ${itemMatched}/${itemTotal} (${pct(itemMatched, itemTotal)})`)
console.log(`facet فعال: ${facetPlaces.size} · دیش فعال: ${dishPlaces.size}`)
console.log(`دسته‌ی نگاشت‌نشده: ${unmatchedSections.size} نام یکتا`)
console.log(`نوشته شد: task/05-facets/COVERAGE.md`)
