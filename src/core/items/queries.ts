import 'server-only'

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  dish as dishTable,
  district as districtTable,
  facet as facetTable,
  media as mediaTable,
  menuItem as menuItemTable,
  menuItemVariant as menuItemVariantTable,
  menuSection as menuSectionTable,
  place as placeTable,
} from '@/db/schema'
import { mediaFullUrl, mediaPublicUrl } from '@/core/media/store'
import { finglishToFa, isLatin, normalizeFa } from '@/core/text/normalize'
import type { MediaRef } from '@/core/places/queries'
import { presentMenuSectionName } from '@/core/places/presentation'
import { discountedPrice } from '@/core/club/discount'

// Indexed single-row lookup: pricing, filtering and sorting use the same offer.
const activeDiscountPercent = sql<number>`COALESCE((SELECT vd.percent FROM venue_discount vd WHERE vd.place_id = ${menuItemTable.placeId} AND vd.active = 1 AND vd.percent BETWEEN 1 AND 90 AND vd.expires_at > CURRENT_TIMESTAMP), 0)`
const effectiveItemPrice = sql<number | null>`CASE WHEN ${menuItemTable.priceUnknown} = 1 THEN NULL ELSE ROUND(${menuItemTable.price} * (100 - ${activeDiscountPercent}) / 100) END`

const PUBLIC_STATUSES = ['published', 'temporarily_closed'] as const

export interface MenuItemCard {
  basePrice?: number | null
  discountPercent?: number
  id: number
  publicId: string
  name: string
  nameEn: string | null
  description: string | null
  price: number | null
  available: boolean
  featured: boolean
  priceUpdatedAt: Date | null
  sectionId: number
  image: MediaRef | null
  sectionName: string
  facetId: string | null
  facetLabel: string | null
  dishSlug: string | null
  dishName: string | null
  /** فاصلهٔ مستقیمِ شعبه از موقعیت کاربر؛ فقط در حالت «نزدیک من» ساخته می‌شود. */
  distanceKm?: number | null
  place: {
    id: number
    slug: string
    name: string
    status: string
    districtName: string | null
    address: string
    coords: { lat: number; lng: number } | null
  }
}

export interface MenuItemDetail extends MenuItemCard {
  fullDescription: string | null
  variants: { id: number; label: string; price: number | null; available: boolean }[]
}

export interface MenuItemSearchFilters {
  query?: string | null
  /** نام کافه/شعبه که از عبارت ترکیبی محصول + کافه جدا شده است. */
  placeQuery?: string | null
  dishId?: number | null
  facetIds?: string[]
  districtId?: string | null
  maxPrice?: number | null
  availableOnly?: boolean
  sort?: 'rating' | 'price_asc' | 'price_desc' | 'quality' | 'name' | 'distance'
  limit?: number
  offset?: number
  excludeId?: number
}

function toMediaRef(path: string | null, width: number | null, height: number | null): MediaRef | null {
  const url = mediaPublicUrl(path)
  const fullUrl = mediaFullUrl(path)
  return url && fullUrl ? { url, fullUrl, width, height } : null
}

function conditionsFor(filters: MenuItemSearchFilters): SQL[] {
  const conditions: SQL[] = [
    inArray(placeTable.status, [...PUBLIC_STATUSES]),
    isNull(menuItemTable.archivedAt),
    inArray(menuSectionTable.branchScope, ['shared', 'branch']),
  ]

  if (filters.availableOnly !== false) conditions.push(eq(menuItemTable.available, true))
  if (filters.dishId) conditions.push(eq(menuItemTable.dishId, filters.dishId))
  if (filters.facetIds?.length) {
    // دستهٔ خام منبع همیشه به اندازهٔ خود آیتم دقیق نیست. برای نمونه آیتم‌های
    // پنهٔ راموز در دستهٔ کلی «شام و نهار» هستند، اما dish آن‌ها pasta است.
    // جست‌وجوی facet باید هر دو مسیر معتبر را بپذیرد تا «پاستا راموز» به‌خاطر
    // عنوان کلی دسته صفر نشود.
    conditions.push(
      or(
        inArray(menuSectionTable.facetId, filters.facetIds),
        inArray(dishTable.facetId, filters.facetIds),
      )!,
    )
  }
  if (filters.districtId) conditions.push(eq(placeTable.districtId, filters.districtId))
  if (filters.maxPrice) conditions.push(lte(effectiveItemPrice, filters.maxPrice))
  if (filters.excludeId) conditions.push(ne(menuItemTable.id, filters.excludeId))

  const normalizedPlace = normalizeFa(filters.placeQuery ?? '').trim()
  if (normalizedPlace) {
    conditions.push(or(
      like(placeTable.nameNormalized, `%${normalizedPlace}%`),
      like(placeTable.nameEn, `%${normalizedPlace}%`),
      like(placeTable.branchName, `%${normalizedPlace}%`),
    )!)
  }

  const normalized = normalizeFa(filters.query ?? '').trim()
  if (normalized) {
    const transliterated = isLatin(normalized) ? finglishToFa(normalized) : ''
    conditions.push(
      or(
        sql`MATCH(${menuItemTable.name}, ${menuItemTable.nameNormalized}) AGAINST (${normalized} IN NATURAL LANGUAGE MODE)`,
        like(menuItemTable.nameNormalized, `%${normalized}%`),
        like(menuItemTable.nameEn, `%${normalized}%`),
        ...(transliterated && transliterated !== normalized
          ? [
              sql`MATCH(${menuItemTable.name}, ${menuItemTable.nameNormalized}) AGAINST (${transliterated} IN NATURAL LANGUAGE MODE)`,
              like(menuItemTable.nameNormalized, `%${transliterated}%`),
            ]
          : []),
      )!,
    )
  }

  return conditions
}

function itemOrder(filters: MenuItemSearchFilters): SQL[] {
  const normalized = normalizeFa(filters.query ?? '').trim()
  if (filters.sort === 'price_asc') {
    return [sql`${effectiveItemPrice} IS NULL`, asc(effectiveItemPrice), asc(menuItemTable.id)]
  }
  if (filters.sort === 'price_desc') {
    return [sql`${effectiveItemPrice} IS NULL`, desc(effectiveItemPrice), asc(menuItemTable.id)]
  }
  if (filters.sort === 'name') return [asc(menuItemTable.name), asc(menuItemTable.id)]
  if (normalized) {
    return [
      desc(sql`MATCH(${menuItemTable.name}, ${menuItemTable.nameNormalized}) AGAINST (${normalized} IN NATURAL LANGUAGE MODE)`),
      desc(menuItemTable.featured),
      asc(menuItemTable.id),
    ]
  }
  return [desc(menuItemTable.featured), asc(effectiveItemPrice), asc(menuItemTable.id)]
}

const itemSelection = {
  id: menuItemTable.id,
  publicId: menuItemTable.publicId,
  name: menuItemTable.name,
  nameEn: menuItemTable.nameEn,
  description: menuItemTable.description,
  price: effectiveItemPrice,
  basePrice: sql<number|null>`CASE WHEN ${menuItemTable.priceUnknown}=1 THEN NULL ELSE ${menuItemTable.price} END`,
  discountPercent: activeDiscountPercent,
  available: menuItemTable.available,
  featured: menuItemTable.featured,
  priceUpdatedAt: menuItemTable.priceUpdatedAt,
  sectionId: menuSectionTable.id,
  mediaPath: mediaTable.localPath,
  mediaWidth: mediaTable.width,
  mediaHeight: mediaTable.height,
  sectionName: menuSectionTable.name,
  facetId: menuSectionTable.facetId,
  facetLabel: facetTable.labelFa,
  dishSlug: dishTable.slug,
  dishName: dishTable.nameFa,
  placeId: placeTable.id,
  placeSlug: placeTable.slug,
  placeName: placeTable.name,
  placeStatus: placeTable.status,
  placeBranchName: placeTable.branchName,
  districtName: districtTable.name,
  address: placeTable.address,
  placeLat: placeTable.lat,
  placeLng: placeTable.lng,
}

interface ItemRow {
  basePrice: number | null
  discountPercent: number
  id: number
  publicId: string
  name: string
  nameEn: string | null
  description: string | null
  price: number | null
  available: boolean
  featured: boolean
  priceUpdatedAt: Date | null
  sectionId: number
  mediaPath: string | null
  mediaWidth: number | null
  mediaHeight: number | null
  sectionName: string
  facetId: string | null
  facetLabel: string | null
  dishSlug: string | null
  dishName: string | null
  placeId: number
  placeSlug: string
  placeName: string
  placeStatus: string
  placeBranchName: string | null
  districtName: string | null
  address: string
  placeLat: string | number | null
  placeLng: string | number | null
}

function mapCard(row: ItemRow): MenuItemCard {
  return {
    basePrice:row.basePrice,
    discountPercent:Number(row.discountPercent),
    id: row.id,
    publicId: row.publicId,
    name: row.name,
    nameEn: row.nameEn,
    description: row.description,
    price: row.price===null?null:Number(row.price),
    available: row.available,
    featured: row.featured,
    priceUpdatedAt: row.priceUpdatedAt,
    sectionId: row.sectionId,
    image: toMediaRef(row.mediaPath, row.mediaWidth, row.mediaHeight),
    sectionName: presentMenuSectionName(row.sectionName, row.placeBranchName),
    facetId: row.facetId,
    facetLabel: row.facetLabel,
    dishSlug: row.dishSlug,
    dishName: row.dishName,
    place: {
      id: row.placeId,
      slug: row.placeSlug,
      name: row.placeName,
      status: row.placeStatus,
      districtName: row.districtName,
      address: row.address,
      coords: row.placeLat !== null && row.placeLng !== null
        ? { lat: Number(row.placeLat), lng: Number(row.placeLng) }
        : null,
    },
  }
}

function baseItemQuery() {
  return getDb()
    .select(itemSelection)
    .from(menuItemTable)
    .innerJoin(placeTable, eq(placeTable.id, menuItemTable.placeId))
    .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
    .leftJoin(districtTable, eq(districtTable.id, placeTable.districtId))
    .leftJoin(mediaTable, eq(mediaTable.id, menuItemTable.mediaId))
    .leftJoin(dishTable, eq(dishTable.id, menuItemTable.dishId))
    .leftJoin(facetTable, eq(facetTable.id, menuSectionTable.facetId))
}

export async function listMenuItemCards(filters: MenuItemSearchFilters): Promise<MenuItemCard[]> {
  const limit = Math.min(Math.max(filters.limit ?? 24, 1), 600)
  const offset = Math.max(filters.offset ?? 0, 0)
  const rows = await baseItemQuery()
    .where(and(...conditionsFor(filters)))
    .orderBy(...itemOrder(filters))
    .limit(limit)
    .offset(offset)
  return rows.map(mapCard)
}

export async function countMenuItems(filters: MenuItemSearchFilters): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`COUNT(*)` })
    .from(menuItemTable)
    .innerJoin(placeTable, eq(placeTable.id, menuItemTable.placeId))
    .innerJoin(menuSectionTable, eq(menuSectionTable.id, menuItemTable.sectionId))
    .leftJoin(dishTable, eq(dishTable.id, menuItemTable.dishId))
    .where(and(...conditionsFor(filters)))
  return Number(row?.count ?? 0)
}

export async function getMenuItemByPublicId(publicId: string): Promise<MenuItemDetail | null> {
  const [row] = await baseItemQuery()
    .where(
      and(
        eq(menuItemTable.publicId, publicId),
        isNull(menuItemTable.archivedAt),
        inArray(placeTable.status, [...PUBLIC_STATUSES]),
        inArray(menuSectionTable.branchScope, ['shared', 'branch']),
      ),
    )
    .limit(1)
  if (!row) return null
  const card = mapCard(row)
  const variants = await getDb()
    .select({
      id: menuItemVariantTable.id,
      label: menuItemVariantTable.label,
      price: menuItemVariantTable.price,
      available: menuItemVariantTable.available,
    })
    .from(menuItemVariantTable)
    .where(eq(menuItemVariantTable.itemId, row.id))
    .orderBy(asc(menuItemVariantTable.sortOrder), asc(menuItemVariantTable.id))
  return { ...card, fullDescription: row.description, variants:variants.map(v=>({...v,price:discountedPrice(v.price,card.discountPercent??0)})) }
}

export async function listSimilarMenuItems(item: MenuItemCard, limit = 8): Promise<MenuItemCard[]> {
  return listMenuItemCards({
    dishId: item.dishSlug ? await dishIdBySlug(item.dishSlug) : null,
    facetIds: !item.dishSlug && item.facetId ? [item.facetId] : undefined,
    availableOnly: true,
    excludeId: item.id,
    limit,
  })
}

async function dishIdBySlug(slug: string): Promise<number | null> {
  const [row] = await getDb()
    .select({ id: dishTable.id })
    .from(dishTable)
    .where(eq(dishTable.slug, slug))
    .limit(1)
  return row?.id ?? null
}
