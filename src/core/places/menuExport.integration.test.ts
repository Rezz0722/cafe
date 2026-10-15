import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { closeDb, getDb, withDbTransaction } from '@/db/client'
import { appUser, menuItem, menuItemVariant, menuSection, place, userPlaceRole } from '@/db/schema'
import { getPlaceRole } from '@/core/auth/userRepo'
import { canReadOwnerOnlyPlaceData } from '@/core/auth/authorization'
import { loadOwnerPlace } from './manage'
import { buildMenuCsv, buildMenuExport } from './menuExport'

test('menu export reads only the authorized branch and never mutates its menu', {
  skip: process.env.KUCAFE_MENU_EXPORT_DB_TEST !== '1',
}, async () => {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.ok(
    url.hostname === '127.0.0.1' &&
    (url.pathname === '/kucafe_menu_export_test' || (process.env.GITHUB_ACTIONS === 'true' && url.pathname === '/kucafe')),
    'Disposable database required; production forbidden',
  )

  const db = getDb()
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12)
  const ownerId = randomUUID(), managerId = randomUUID(), strangerId = randomUUID()
  const userIds = [ownerId, managerId, strangerId]
  const placeIds: number[] = []

  try {
    await db.insert(appUser).values(userIds.map(id => ({ id, name: `QA ${suffix}`, role: 'owner' as const })))
    for (const branch of ['owned', 'foreign']) {
      const [row] = await db.insert(place).values({
        slug: `qa-export-${suffix}-${branch}`, name: `QA ${branch}`,
        nameNormalized: `QA ${branch}`, status: 'published',
      })
      placeIds.push(row.insertId)
    }
    const ownPlaceId = placeIds[0]!, foreignPlaceId = placeIds[1]!
    await db.insert(userPlaceRole).values([
      { userId: ownerId, placeId: ownPlaceId, role: 'owner' },
      { userId: managerId, placeId: ownPlaceId, role: 'manager' },
      { userId: strangerId, placeId: foreignPlaceId, role: 'owner' },
    ])
    const sectionIds: number[] = []
    for (const [placeId, scope] of [
      [ownPlaceId, 'branch'], [ownPlaceId, 'shared'],
      [ownPlaceId, 'other_branch'], [ownPlaceId, 'unverified'],
      [foreignPlaceId, 'branch'],
    ] as const) {
      const [row] = await db.insert(menuSection).values({ placeId, name: `QA ${scope} ${sectionIds.length}`, branchScope: scope, sortOrder: sectionIds.length })
      sectionIds.push(row.insertId)
    }
    const itemNames = ['Owner latte', 'Owner archived', 'Foreign branch secret', 'Quarantine secret', 'Other cafe secret']
    const itemIds: number[] = []
    const priceDate = new Date('2026-10-15T10:00:00Z')
    for (let index = 0; index < sectionIds.length; index++) {
      const [row] = await db.insert(menuItem).values({
        placeId: index === 4 ? foreignPlaceId : ownPlaceId,
        sectionId: sectionIds[index]!, publicId: `qaexp_${suffix}_${index}`,
        name: itemNames[index]!, nameNormalized: itemNames[index]!,
        price: index === 0 ? 120000 : null,
        priceUpdatedAt: index === 0 ? priceDate : null,
        archivedAt: index === 1 ? priceDate : null,
      })
      itemIds.push(row.insertId)
    }
    await db.insert(menuItemVariant).values({ itemId: itemIds[0]!, label: 'بزرگ', price: 150000, priceUpdatedAt: priceDate })

    assert.equal(canReadOwnerOnlyPlaceData('owner', await getPlaceRole(ownerId, ownPlaceId)), true)
    assert.equal(canReadOwnerOnlyPlaceData('owner', await getPlaceRole(ownerId, foreignPlaceId)), false)
    assert.equal(canReadOwnerOnlyPlaceData('owner', await getPlaceRole(managerId, ownPlaceId)), false)
    assert.equal(canReadOwnerOnlyPlaceData('owner', await getPlaceRole(strangerId, ownPlaceId)), false)
    await db.update(userPlaceRole).set({ status: 'revoked' }).where(eq(userPlaceRole.userId, ownerId))
    assert.equal(canReadOwnerOnlyPlaceData('owner', await getPlaceRole(ownerId, ownPlaceId)), false)
    await db.update(userPlaceRole).set({ status: 'active' }).where(eq(userPlaceRole.userId, ownerId))

    const before = await db.select().from(menuItem).where(eq(menuItem.placeId, ownPlaceId))
    const ownerPlace = await withDbTransaction(() => loadOwnerPlace(ownPlaceId))
    assert.ok(ownerPlace)
    const exportData = buildMenuExport(ownerPlace, priceDate)
    const serialized = JSON.stringify(exportData)
    const csv = buildMenuCsv(exportData)
    assert.equal(exportData.sections.length, 2)
    assert.equal(exportData.sections[0]!.items[0]!.price, 120000)
    assert.equal(exportData.sections[0]!.items[0]!.variants[0]!.price, 150000)
    assert.equal(exportData.sections[1]!.items[0]!.archived, true)
    assert.equal(exportData.sections[0]!.items[0]!.priceUpdatedAt, priceDate.toISOString())
    for (const secret of itemNames.slice(2)) {
      assert.equal(serialized.includes(secret), false, secret)
      assert.equal(csv.includes(secret), false, secret)
    }
    assert.ok(csv.includes('"150000"'))
    assert.ok(csv.includes('"نامعلوم"'))
    assert.deepEqual(await db.select().from(menuItem).where(eq(menuItem.placeId, ownPlaceId)), before)
  } finally {
    if (placeIds.length) {
      await db.delete(menuItem).where(inArray(menuItem.placeId, placeIds))
      await db.delete(menuSection).where(inArray(menuSection.placeId, placeIds))
      await db.delete(userPlaceRole).where(inArray(userPlaceRole.placeId, placeIds))
      await db.delete(place).where(inArray(place.id, placeIds))
    }
    await db.delete(appUser).where(inArray(appUser.id, userIds))
    await closeDb()
  }
})
