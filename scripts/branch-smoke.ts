import { eq, sql } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection'
import { menuItem, menuSection, place } from '../src/db/schema'
import { loadOwnerPlace } from '../src/core/places/manage'
import { getPlaceDetail } from '../src/core/places/queries'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const db = getDb()
  const [ramouz] = await db
    .select({ id: place.id, slug: place.slug, branchName: place.branchName })
    .from(place)
    .where(eq(place.sourceId, 38))
    .limit(1)
  if (!ramouz) throw new Error('رکورد راموز پیدا نشد.')

  const [counts] = await db
    .select({
      totalSections: sql<number>`COUNT(DISTINCT ${menuSection.id})`,
      publicSections: sql<number>`COUNT(DISTINCT CASE WHEN ${menuSection.branchScope} IN ('shared', 'branch') THEN ${menuSection.id} END)`,
      totalItems: sql<number>`COUNT(${menuItem.id})`,
      publicItems: sql<number>`SUM(CASE WHEN ${menuSection.branchScope} IN ('shared', 'branch') THEN 1 ELSE 0 END)`,
    })
    .from(menuSection)
    .leftJoin(menuItem, eq(menuItem.sectionId, menuSection.id))
    .where(eq(menuSection.placeId, ramouz.id))

  check('هویت شعبهٔ راموز صریح است', ramouz.branchName === 'قاضی طباطبایی')
  check('دادهٔ شعبه‌های دیگر حفظ ولی از خروجی جدا شده', Number(counts.totalSections) > Number(counts.publicSections), `${counts.publicSections}/${counts.totalSections} دسته`)
  check('آیتم‌های شعبهٔ دیگر در Scope عمومی نیستند', Number(counts.totalItems) > Number(counts.publicItems), `${counts.publicItems}/${counts.totalItems} آیتم`)

  const publicDetail = await getPlaceDetail(ramouz.slug)
  const publicItemCount = publicDetail?.menu.reduce((sum, section) => sum + section.items.length, 0) ?? 0
  check('صفحه عمومی فقط دسته‌های مجاز را می‌خواند', publicDetail?.menu.length === Number(counts.publicSections), `${publicDetail?.menu.length ?? 0} دسته`)
  check('شمار آیتم عمومی با Scope دیتابیس یکی است', publicItemCount === Number(counts.publicItems), `${publicItemCount} آیتم`)

  const ownerView = await loadOwnerPlace(ramouz.id)
  const adminView = await loadOwnerPlace(ramouz.id, { includeForeignBranchSections: true })
  check('مدیر شعبه دستهٔ شعبه‌های دیگر را دریافت نمی‌کند', ownerView?.sections.length === Number(counts.publicSections))
  check('مدیر سیستم دادهٔ حفظ‌شده را برای اصلاح می‌بیند', adminView?.sections.length === Number(counts.totalSections))

  await closeDb()
  console.log(failures === 0 ? '\nهمهٔ بررسی‌های شعبه موفق.' : `\n${failures} بررسی شکست خورد.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
