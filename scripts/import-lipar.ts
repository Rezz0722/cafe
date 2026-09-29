/**
 * Import the supplied, structured Lipar Cafe menu.
 *
 * Usage:
 *   node --import tsx --conditions=react-server scripts/import-lipar.ts --dry-run
 *   node --import tsx --conditions=react-server scripts/import-lipar.ts --apply
 *   node --import tsx --conditions=react-server scripts/import-lipar.ts --apply --publish
 *
 * The source prices are expressed in thousand toman and are always converted
 * before writing.  The import is intentionally idempotent and never touches
 * the older ambiguous `کافه-لیپار` draft record.
 */

import { createHash } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { closeDb, getDb, withDbTransaction } from '../src/db/connection.ts'
import {
  auditLog,
  dish as dishTable,
  menuItem as menuItemTable,
  menuItemVariant as menuItemVariantTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeBrand as placeBrandTable,
  placeHours as placeHoursTable,
} from '../src/db/schema.ts'
import { classifyGeo } from '../src/core/import/normalize.ts'
import { refreshPlaceDerived } from '../src/core/places/manage.ts'
import { normalizeFa } from '../src/core/text/normalize.ts'
import { matchDish, matchFacet } from '../src/core/taxonomy/menuTaxonomy.ts'

type Scalar = readonly [id: string, name: string, price: number, description?: string, needsReview?: boolean]
type Variant = readonly [id: string, name: string, prices: readonly number[], description?: string]
type SourceItem = Scalar | Variant
type Category = { id: string; name: string; items: readonly SourceItem[] }

const variants = (id: string, name: string, prices: readonly number[], description?: string): Variant => [id, name, prices, description]
const item = (id: string, name: string, price: number, description?: string, needsReview?: boolean): Scalar => [id, name, price, description, needsReview]

const PRICE_LABELS = ['70/30', '50/50', '100%'] as const
const CATEGORIES: readonly Category[] = [
  { id: 'tea-herbal', name: 'چای و دمنوش', items: [
    item('tea-masala','چای ماسالا',200), item('tea-karak','چای کرک',200), item('herbal-shab-noosh','دمنوش شب نوش',180,'سیب، زعفران، گل محمدی'),
    item('herbal-johar-abi','دمنوش جوهر آبی',180,'پنیرک، زعفران، هل، گل محمدی، نبات',true), item('herbal-afarinesh','دمنوش آفرینش',140,'چای ترش، بری و میوه‌های استوایی',true),
    item('herbal-fasl-asheghi','دمنوش فصل عاشقی',140,'پرتقال سرخ، سیب، چای سیاه، گلبرگ رز'), item('herbal-yas','دمنوش یاس',140,'گل یاس، چای سبز'), item('herbal-iran-banoo','دمنوش ایران بانو',140,'به، بابونه، رازیانه، سیب'),
    item('herbal-raz-shab','دمنوش راز شب',140,'ترکیبات روی تصویر کاملاً خوانا نیست',true), item('herbal-paeez-talaei','دمنوش پاییز طلایی',140,'به، پرتقال سرخ، گلرنگ'), item('herbal-solh','دمنوش صلح',140,'سیب، هل، اسطوخودوس'), item('black-tea-brewed','چای سیاه دمی',100), item('plain-tea','چای ساده',80),
  ] },
  { id: 'cold-brew-iced-tea', name: 'کلد برو و آیس تی', items: [
    item('cold-brew-plain','کلد برو ساده',150), item('cold-brew-nitro-flavored','کلد برو نیترو طعم‌دار',200,'سودا، انگور، آلبالو، کلاسیک'), item('cold-brew-irish','کلد برو آیریش',220), item('cold-brew-persian','کلد برو پرشین',220), item('cold-brew-shiraz','کلد برو شیراز',250), item('iced-tea','آیس تی',200),
  ] },
  { id: 'add-ons', name: 'افزودنی‌ها', items: [item('addon-syrup','سیروپ',30),item('addon-cream','خامه',50),item('addon-icecream','بستنی',50),item('addon-soda','سودا',30),item('addon-natural-lemon-juice','آبلیمو طبیعی',30)] },
  { id: 'cold-drinks', name: 'نوشیدنی‌های سرد', items: [
    variants('tonic','تونیک',[190,220,250],'قهوه، سودا، یخ، آب‌لیمو طبیعی'), variants('orange-coffee','پرتقال قهوه',[230,260,290],'آب پرتقال طبیعی، قهوه، یخ'), item('lemonade','لیموناد',140), variants('coffee-lemonade','لیموناد با قهوه',[210,240,270]), item('mojito','موهیتو',130), item('iced-masala','آیس ماسالا',200), item('iced-karak','آیس کرک',200), item('iced-chocolate','آیس چاکلت',200), item('iced-chocolate-strawberry','آیس چاکلت توت فرنگی',230), item('iced-chocolate-nutty','آیس چاکلت آجیلی',230),
  ] },
  { id: 'cold-infusions', name: 'سرد نوش‌ها', items: [
    item('cold-infusion-firouzeh','سرد نوش فیروزه',140,'سیب، نعنا، آب‌لیمو طبیعی'), item('cold-infusion-red-triangle','سرد نوش مثلث سرخ',140,'خاکشیر، آب‌لیمو طبیعی، آلو، زعفران',true), item('cold-infusion-yashm','سرد نوش یشم',120,'نعنا، آب‌لیمو طبیعی'), item('cold-infusion-kahraba','سرد نوش کهربا',120,'گلاب، زعفران'), item('cold-infusion-aghigh','سرد نوش عقیق',120,'زعفران'), item('cold-infusion-zomorrod','سرد نوش زمرد',120,'نعنا'), item('cold-infusion-hadid','سرد نوش حدید',120,'سکنجبین'), item('cold-infusion-yaghout','سرد نوش یاقوت',120,'نبات، زعفران'), item('cold-infusion-se-gol','سرد نوش سه گل',120,'عرق بیدمشک + گلاب'), item('cold-infusion-gol-aram','سرد نوش گل آرام',120,'عرق کاسنی + آب‌لیمو طبیعی'), item('cold-infusion-nargol','سرد نوش نارگل',150,'عرق بیدمشک + عرق بهارنارنج + آب‌لیمو طبیعی'), item('cold-infusion-bahar','سرد نوش بهار',120,'بهارنارنج + آب‌لیمو طبیعی'),
  ] },
  { id: 'hot-drinks', name: 'نوشیدنی‌های گرم', items: [
    variants('espresso','اسپرسو',[120,150,180]), variants('americano','آمریکانو',[125,155,185]), variants('latte','لاته',[200,230,260]), variants('original-cappuccino','اوریجینال کاپوچینو',[180,210,230]), variants('cortado','کورتادو',[150,180,210]), variants('original-mocha','اوریجینال موکا',[240,270,300]), variants('cream-mocha','موکا خامه‌ای',[270,300,330]), item('cappuccino-no-coffee','کاپوچینو (بدون قهوه)',200), item('hot-chocolate','شکلات داغ',200), item('hot-chocolate-strawberry','شکلات داغ توت فرنگی',230), item('hot-chocolate-nutty','شکلات داغ آجیلی',230), item('milk-honey-cinnamon','شیر عسل دارچین',200), item('coffee-mix','کافی میکس',200),
  ] },
  { id: 'iced-coffee', name: 'سرد و خنک بر پایه قهوه', items: [
    variants('iced-coffee','آیس کافی',[120,150,180]), variants('iced-americano','آیس آمریکانو',[125,155,185]), variants('iced-latte','آیس لاته',[200,230,260]), variants('iced-latte-icecream','آیس لاته بستنی',[250,280,310]), variants('iced-coconut-latte','آیس لاته نارگیل',[250,280,310]), variants('iced-coconut-latte-icecream','آیس لاته نارگیل بستنی',[300,330,360]), variants('iced-mocha','آیس موکا',[240,270,300]), variants('iced-hazelnut-mocha','آیس موکا فندقی',[280,310,340]), variants('affogato','آفوگاتو',[230,260,290]),
  ] },
  { id: 'matcha-bar', name: 'ماچا بار', items: [item('matcha-latte','ماچا لاته',230),item('coconut-matcha-latte','ماچا لاته نارگیل',250),item('strawberry-matcha','ماچا توت فرنگی',250),item('mango-matcha','ماچا انبه',230),item('peach-matcha','ماچا هلو',230)] },
]

const BRANCHES = [
  { slug: 'lipar-cafe-branch-1', branchName: 'حجاب', address: 'شهرک غرب، نبش حجاب 64، مشهد', lat: 36.3586, lng: 59.5193, isPrimaryBranch: true },
  { slug: 'lipar-cafe-branch-2', branchName: 'امامیه', address: 'شهرک غرب، بین امامیه 31 و چهارراه استاد یوسفی، مشهد', lat: 36.35629, lng: 59.51908, isPrimaryBranch: false },
] as const
const REVIEW_IDS = ['herbal-johar-abi','herbal-afarinesh','herbal-raz-shab','cold-infusion-red-triangle'] as const
const apply = process.argv.includes('--apply')
const publish = process.argv.includes('--publish')
if (publish && !apply) throw new Error('--publish فقط همراه --apply مجاز است.')

const toman = (value: number) => {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) throw new Error(`قیمت منبع نامعتبر است: ${value}`)
  return value * 1_000
}
const publicId = (branchSlug: string, itemId: string) => `mi_${createHash('sha256').update(`${branchSlug}:${itemId}`).digest('hex').slice(0, 24)}`
const sourceItem = (raw: SourceItem) => ({ id: raw[0], name: raw[1], prices: raw.length === 4 && Array.isArray(raw[2]) ? raw[2] as readonly number[] : null, price: raw.length === 4 && Array.isArray(raw[2]) ? null : raw[2] as number, description: raw[3] ?? null, needsReview: raw.length === 5 ? Boolean(raw[4]) : false })

async function preview() {
  const db = getDb()
  const existing = await db.select({ id: placeTable.id, slug: placeTable.slug, status: placeTable.status, address: placeTable.address }).from(placeTable).where(inArray(placeTable.slug, [...BRANCHES.map((branch) => branch.slug), 'کافه-لیپار']))
  const itemCount = CATEGORIES.reduce((total, category) => total + category.items.length, 0)
  const variantCount = CATEGORIES.flatMap((category) => category.items).filter((entry) => Array.isArray(entry[2])).length * PRICE_LABELS.length
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', publish, branches: BRANCHES.length, categories: CATEGORIES.length, itemsPerBranch: itemCount, variantsPerBranch: variantCount, reviewRequiredItemIds: REVIEW_IDS, existing }, null, 2))
}

async function importBranch(branch: typeof BRANCHES[number], brandId: number, dishes: Map<string, number>) {
  const db = getDb()
  const [found] = await db.select().from(placeTable).where(eq(placeTable.slug, branch.slug)).limit(1)
  let placeId: number
  if (found) {
    placeId = found.id
    await db.update(placeTable).set({ brandId, branchName: branch.branchName, isPrimaryBranch: branch.isPrimaryBranch, name: 'کافه لیپار', nameEn: 'Lipar Cafe', nameNormalized: normalizeFa('کافه لیپار'), kind: 'cafe', status: publish ? 'published' : found.status, lat: branch.lat.toFixed(7), lng: branch.lng.toFixed(7), geoStatus: classifyGeo(branch.lat, branch.lng), address: branch.address, districtId: null, priceUnitFixed: true, source: 'user', revision: found.revision + 1 }).where(eq(placeTable.id, placeId))
  } else {
    const [created] = await db.insert(placeTable).values({ slug: branch.slug, brandId, branchName: branch.branchName, isPrimaryBranch: branch.isPrimaryBranch, name: 'کافه لیپار', nameEn: 'Lipar Cafe', nameNormalized: normalizeFa('کافه لیپار'), kind: 'cafe', status: publish ? 'published' : 'draft', lat: branch.lat.toFixed(7), lng: branch.lng.toFixed(7), geoStatus: classifyGeo(branch.lat, branch.lng), address: branch.address, districtId: null, priceUnitFixed: true, source: 'user' }).$returningId()
    if (!created) throw new Error(`ساخت ${branch.slug} انجام نشد.`)
    placeId = created.id
  }

  await db.delete(placeHoursTable).where(eq(placeHoursTable.placeId, placeId))
  await db.insert(placeHoursTable).values(Array.from({ length: 7 }, (_, dow) => ({ placeId, dow, shiftIndex: 0, opensAt: '06:00:00', closesAt: '23:00:00', crossesMidnight: false, closed: false })))
  const sections = await db.select().from(menuSectionTable).where(eq(menuSectionTable.placeId, placeId))
  const sectionByName = new Map(sections.map((section) => [normalizeFa(section.name), section]))

  let itemCount = 0
  for (const [sectionIndex, category] of CATEGORIES.entries()) {
    const key = normalizeFa(category.name)
    const facetId = matchFacet(category.name)
    let section = sectionByName.get(key)
    if (!section) {
      const [created] = await db.insert(menuSectionTable).values({ placeId, name: category.name, facetId, branchScope: 'shared', branchLabel: null, sortOrder: sectionIndex }).$returningId()
      if (!created) throw new Error(`ساخت دستهٔ ${category.name} انجام نشد.`)
      section = { id: created.id } as typeof sections[number]
    } else {
      await db.update(menuSectionTable).set({ name: category.name, facetId, branchScope: 'shared', branchLabel: null, sortOrder: sectionIndex }).where(eq(menuSectionTable.id, section.id))
    }

    const existingItems = await db.select().from(menuItemTable).where(and(eq(menuItemTable.placeId, placeId), eq(menuItemTable.sectionId, section.id)))
    const itemsByName = new Map(existingItems.map((menuItem) => [normalizeFa(menuItem.name), menuItem]))
    for (const [sortOrder, raw] of category.items.entries()) {
      const source = sourceItem(raw)
      const hasVariants = source.prices !== null
      const basePrice = hasVariants ? Math.min(...source.prices!.map(toman)) : toman(source.price!)
      const dishSlug = matchDish(source.name, facetId, { price: basePrice, sectionName: category.name })
      const values = { sectionId: section.id, name: source.name, nameNormalized: normalizeFa(source.name), description: source.description, price: basePrice, priceUnknown: false, excludeFromPriceStats: category.id === 'add-ons', available: true, featured: false, dishId: dishSlug ? dishes.get(dishSlug) ?? null : null, sortOrder, archivedAt: null, priceUpdatedAt: new Date() }
      let menuItem = itemsByName.get(values.nameNormalized)
      if (!menuItem) {
        const [created] = await db.insert(menuItemTable).values({ publicId: publicId(branch.slug, source.id), placeId, ...values }).$returningId()
        if (!created) throw new Error(`ساخت آیتم ${source.name} انجام نشد.`)
        menuItem = { id: created.id } as typeof existingItems[number]
      } else {
        await db.update(menuItemTable).set(values).where(eq(menuItemTable.id, menuItem.id))
      }
      if (hasVariants) {
        const present = await db.select().from(menuItemVariantTable).where(eq(menuItemVariantTable.itemId, menuItem.id))
        const byLabel = new Map(present.map((variant) => [variant.label, variant]))
        for (const [variantIndex, price] of source.prices!.entries()) {
          const label = PRICE_LABELS[variantIndex]!
          const old = byLabel.get(label)
          const variantValues = { price: toman(price), available: true, sortOrder: variantIndex, priceUpdatedAt: new Date() }
          if (old) await db.update(menuItemVariantTable).set(variantValues).where(eq(menuItemVariantTable.id, old.id))
          else await db.insert(menuItemVariantTable).values({ itemId: menuItem.id, label, ...variantValues })
        }
      }
      itemCount++
    }
  }
  await refreshPlaceDerived(placeId)
  await db.insert(auditLog).values({ actorUserId: null, actorLabel: 'ایمپورت ساختاریافتهٔ لیپار', action: 'place.manual_import', entity: 'place', entityId: String(placeId), before: null, after: { placeId, source: 'user_supplied_structured_menu', menuId: 'lipar-menu-001', sharedMenu: true, priceUnit: '1000_toman_converted_to_toman', approximateCoordinates: true, reviewRequiredItemIds: REVIEW_IDS, itemCount } })
  return { placeId, slug: branch.slug, itemCount }
}

async function main() {
  await preview()
  if (!apply) return
  const result = await withDbTransaction(async () => {
    const db = getDb()
    const [brand] = await db.select().from(placeBrandTable).where(eq(placeBrandTable.slug, 'lipar-cafe')).limit(1)
    const brandId = brand?.id ?? (await db.insert(placeBrandTable).values({ slug: 'lipar-cafe', name: 'کافه لیپار', nameEn: 'Lipar Cafe', status: 'active' }).$returningId())[0]!.id
    const dishes = new Map((await db.select({ id: dishTable.id, slug: dishTable.slug }).from(dishTable)).map((dish) => [dish.slug, dish.id]))
    const branches = []
    for (const branch of BRANCHES) branches.push(await importBranch(branch, brandId, dishes))
    return { brandId, branches }
  })
  console.log(JSON.stringify({ ok: true, published: publish, ...result, notes: ['آیتم‌های علامت‌خورده در گزارش audit ثبت شدند و به بررسی منوی اصلی نیاز دارند.'] }, null, 2))
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(closeDb)
