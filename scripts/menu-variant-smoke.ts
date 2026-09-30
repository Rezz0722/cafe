import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { getDb } from '../src/db/client'
import { closeDb } from '../src/db/connection'
import { auditLog, menuItem, menuItemVariant, place } from '../src/db/schema'
import {
  bulkAdjustPrices,
  bulkSetAvailability,
  createMenuItem,
  createMenuItemVariant,
  createMenuSection,
  deleteMenuItemVariant,
  loadOwnerPlace,
  moveMenuItemVariant,
  updateMenuItemVariant,
} from '../src/core/places/manage'
import { getPlaceDetail } from '../src/core/places/queries'

const db = getDb()
const actor = { userId: 'menu-variant-smoke', label: 'menu-variant-smoke' }
let placeId: number | null = null

try {
  const slug = `menu-variant-smoke-${Date.now()}`
  const [createdPlace] = await db.insert(place).values({
    slug,
    name: 'کافه آزمایشی سایز',
    nameNormalized: 'کافه آزمایشی سایز',
    status: 'draft',
    source: 'owner',
  }).$returningId()
  placeId = createdPlace!.id
  const section = await createMenuSection(placeId, 'قهوه', actor)
  assert.equal(section.ok, true)
  const ownerBefore = await loadOwnerPlace(placeId)
  const sectionId = ownerBefore!.sections[0]!.id
  const item = await createMenuItem(placeId, { sectionId, name: 'لاته', price: 90_000 }, actor)
  assert.equal(item.ok, true)
  assert.ok(item.itemId)

  assert.equal((await createMenuItemVariant(item.itemId!, { label: 'کوچک', price: 110_000 }, actor)).ok, true)
  assert.equal((await createMenuItemVariant(item.itemId!, { label: 'بزرگ', price: 145_000 }, actor)).ok, true)
  let owner = await loadOwnerPlace(placeId)
  assert.equal(owner!.sections[0]!.items[0]!.variants.length, 2)
  assert.equal(owner!.sections[0]!.items[0]!.price, 110_000)
  console.log('✓ دو سایز با قیمت مستقل ساخته و قیمت شروع همگام شد')

  const variants = owner!.sections[0]!.items[0]!.variants
  assert.equal((await moveMenuItemVariant(variants[1]!.id, 'up', actor)).ok, true)
  owner = await loadOwnerPlace(placeId)
  assert.equal(owner!.sections[0]!.items[0]!.variants[0]!.label, 'بزرگ')
  console.log('✓ ترتیب سایزها پایدار است')

  const small = owner!.sections[0]!.items[0]!.variants.find((variant) => variant.label === 'کوچک')!
  await updateMenuItemVariant(small.id, { label: 'کوچک', price: 120_000, available: false }, actor)
  let [base] = await db.select({ price: menuItem.price, available: menuItem.available }).from(menuItem).where(eq(menuItem.id, item.itemId!)).limit(1)
  assert.equal(base!.price, 145_000)
  console.log('✓ سایز ناموجود از قیمت شروع کنار گذاشته شد')

  const large = owner!.sections[0]!.items[0]!.variants.find((variant) => variant.label === 'بزرگ')!
  await updateMenuItemVariant(large.id, { label: 'بزرگ', price: 145_000, available: false }, actor)
  ;[base] = await db.select({ price: menuItem.price, available: menuItem.available }).from(menuItem).where(eq(menuItem.id, item.itemId!)).limit(1)
  assert.equal(base!.price, null)
  assert.equal(base!.available, false)
  await updateMenuItemVariant(large.id, { label: 'بزرگ', price: 145_000, available: true }, actor)
  console.log('✓ نبود هیچ سایز موجود، خود آیتم را از نتایج موجود خارج می‌کند')

  await bulkSetAvailability(placeId, false, actor)
  let allVariants = await db.select({ available: menuItemVariant.available }).from(menuItemVariant).where(eq(menuItemVariant.itemId, item.itemId!))
  assert.ok(allVariants.every((variant) => !variant.available))
  await bulkSetAvailability(placeId, true, actor)
  allVariants = await db.select({ available: menuItemVariant.available }).from(menuItemVariant).where(eq(menuItemVariant.itemId, item.itemId!))
  assert.ok(allVariants.every((variant) => variant.available))
  console.log('✓ عملیات گروهی موجودی روی همهٔ سایزها هم اعمال شد')

  const publicView = await getPlaceDetail(slug, { includeUnpublished: true })
  assert.equal(publicView!.menu[0]!.items[0]!.variants.length, 2)
  assert.equal(publicView!.menu[0]!.items[0]!.variants[0]!.label, 'بزرگ')
  console.log('✓ همان داده در صفحه عمومی شعبه قابل خواندن است')

  const bulk = await bulkAdjustPrices(placeId, 10, actor)
  assert.equal(bulk.ok, true)
  const afterBulk = await db.select({ label: menuItemVariant.label, price: menuItemVariant.price }).from(menuItemVariant).where(eq(menuItemVariant.itemId, item.itemId!))
  assert.deepEqual(new Map(afterBulk.map((row) => [row.label, row.price])), new Map([['کوچک', 132_000], ['بزرگ', 160_000]]))
  console.log('✓ تغییر گروهی قیمت روی خود سایزها اعمال شد')

  const current = (await loadOwnerPlace(placeId))!.sections[0]!.items[0]!.variants
  for (const variant of current) await deleteMenuItemVariant(variant.id, actor)
  ;[base] = await db.select({ price: menuItem.price, available: menuItem.available }).from(menuItem).where(eq(menuItem.id, item.itemId!)).limit(1)
  assert.equal(base!.price, null)
  assert.equal(base!.available, true)
  console.log('✓ حذف آخرین سایز، قیمت قدیمی و گمراه‌کننده باقی نمی‌گذارد')
} finally {
  if (placeId) await db.delete(place).where(eq(place.id, placeId))
  await db.delete(auditLog).where(eq(auditLog.actorUserId, actor.userId))
  await closeDb()
}
