/**
 * بازسازی حداقل/میانه/حداکثر و ردهٔ قیمت همهٔ مکان‌ها از روی قواعد فعلی پنل.
 *
 *   npm run prices:recompute
 */
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection.ts'
import { menuItem, place } from '../src/db/schema.ts'
import { refreshPlaceDerived } from '../src/core/places/manage.ts'
import { getDataPolicy } from '../src/core/settings/policies.ts'

const db = getDb()
const policy = await getDataPolicy()

const conditions = [isNull(menuItem.archivedAt), eq(menuItem.excludeFromPriceStats, false)]
if (policy.priceStatsMaxItemPrice > 0) {
  conditions.push(gt(menuItem.price, policy.priceStatsMaxItemPrice))
}

const [{ automaticOutliers = 0 } = { automaticOutliers: 0 }] = policy.priceStatsMaxItemPrice > 0
  ? await db
      .select({ automaticOutliers: sql<number>`COUNT(*)` })
      .from(menuItem)
      .where(and(...conditions))
  : [{ automaticOutliers: 0 }]

const [{ manualExclusions = 0 } = { manualExclusions: 0 }] = await db
  .select({ manualExclusions: sql<number>`COUNT(*)` })
  .from(menuItem)
  .where(and(isNull(menuItem.archivedAt), eq(menuItem.excludeFromPriceStats, true)))

const places = await db.select({ id: place.id }).from(place)
for (const [index, row] of places.entries()) {
  await refreshPlaceDerived(row.id)
  if ((index + 1) % 100 === 0) console.log(`بازمحاسبه ${index + 1}/${places.length}`)
}

console.log(
  `پایان: ${places.length} مجموعه · ${Number(manualExclusions)} حذف دستی · ${Number(automaticOutliers)} بالاتر از سقف خودکار`,
)
await closeDb()
