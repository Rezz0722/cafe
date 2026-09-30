/** دود-تست read-only برای جداسازی Place / MenuItem / Dish روی دادهٔ واقعی. */
import { sql } from 'drizzle-orm'
import {
  countMenuItems,
  getMenuItemByPublicId,
  listMenuItemCards,
} from '../src/core/items/queries'
import { resolveProductIntent } from '../src/core/search/resolveEntity'
import { getDishBySlug } from '../src/core/places/queries'
import { closeDb, getDb } from '../src/db/connection'

async function main() {
  let failures = 0
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`)
    if (!ok) failures++
  }

  const coffee = resolveProductIntent('قهوه')
  const pasta = resolveProductIntent('پاستا')
  check('قهوه به خانوادهٔ آیتم‌ها resolve می‌شود', coffee.kind === 'facet')
  check('پاستا به facet آیتم resolve می‌شود', pasta.kind === 'facet')

  const coffeeFacets = coffee.kind === 'facet' ? coffee.facetIds : []
  const pastaFacets = pasta.kind === 'facet' ? pasta.facetIds : []
  const [coffeeCount, pastaCount, pastaCards, ramouzPastaCards, alfredo] = await Promise.all([
    countMenuItems({ facetIds: coffeeFacets }),
    countMenuItems({ facetIds: pastaFacets }),
    listMenuItemCards({ facetIds: pastaFacets, limit: 3 }),
    listMenuItemCards({ facetIds: pastaFacets, placeQuery: 'راموز', limit: 20 }),
    getDishBySlug('alfredo-pasta'),
  ])
  check('جست‌وجوی قهوه آیتم واقعی دارد', coffeeCount > 0, String(coffeeCount))
  check('جست‌وجوی پاستا آیتم واقعی دارد', pastaCount > 0, String(pastaCount))
  check(
    'جست‌وجوی ترکیبی پاستا + نام کافه نتیجه دارد',
    ramouzPastaCards.length > 0 && ramouzPastaCards.every((item) => item.place.name.includes('راموز')),
    `${ramouzPastaCards.length} آیتم راموز`,
  )
  check('کارت آیتم به کافه وصل است', pastaCards.every((item) => Boolean(item.place.slug)))
  check('Dish آلفردو وجود دارد', Boolean(alfredo))

  const sample = pastaCards[0]
  const detail = sample ? await getMenuItemByPublicId(sample.publicId) : null
  check('صفحهٔ آیتم با public id دوباره خوانده می‌شود', detail?.id === sample?.id)

  const [identity] = await getDb().execute(sql`
    SELECT
      COUNT(*) AS total,
      COUNT(public_id) AS with_public_id,
      COUNT(DISTINCT public_id) AS distinct_public_id,
      COUNT(source_id) AS with_source,
      COUNT(DISTINCT source_id) AS distinct_source
    FROM menu_item
  `)
  const row = (identity as unknown as Array<{
    total: number
    with_public_id: number
    distinct_public_id: number
    with_source: number
    distinct_source: number
  }>)[0]
  check(
    'public id همهٔ آیتم‌ها کامل و یکتا است',
    Number(row?.total) === Number(row?.with_public_id)
      && Number(row?.total) === Number(row?.distinct_public_id),
    `${row?.distinct_public_id}/${row?.total}`,
  )
  check(
    'source idهای import شده تکراری نیستند',
    Number(row?.with_source) === Number(row?.distinct_source),
    `${row?.distinct_source}/${row?.with_source}`,
  )

  await closeDb()
  if (failures > 0) process.exit(1)
}

main().catch(async (error) => {
  console.error(error)
  await closeDb()
  process.exit(1)
})
