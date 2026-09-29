import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection.ts'
import {
  dish as dishTable,
  media as mediaTable,
  menuItem as menuItemTable,
  menuSection as menuSectionTable,
  place as placeTable,
  placeHours as placeHoursTable,
  placePhone as placePhoneTable,
  placeSocial as placeSocialTable,
} from '../src/db/schema.ts'
import {
  readTopMenuSyncState,
  topMenuSyncRoot,
  writeTopMenuSyncState,
  type TopMenuPriceChange,
  type TopMenuSyncReport,
} from '../src/core/sync/topMenuSync.ts'
import { refreshPlaceDerived, recordAudit } from '../src/core/places/manage.ts'
import {
  cleanLine,
  classifyGeo,
  detectKind,
  detectPriceContext,
  makeSlug,
  median,
  normalizePrice,
  parseHours,
  parseInstagramHandle,
  parsePhones,
  parseSocials,
  pickDistrict,
  priceTierFromMedian,
  stripHtml,
  type PriceContext,
} from '../src/core/import/normalize.ts'
import {
  extractSourceImages,
  flattenCafeItems,
  flattenSectionItems,
  rawItemDescription,
  type RawCafe,
  type RawMenuItem,
} from '../src/core/import/source.ts'
import { computeQualityFromFacts } from '../src/core/quality/scores.ts'
import { getDataPolicy } from '../src/core/settings/policies.ts'
import { normalizeFa } from '../src/core/text/normalize.ts'
import { hashUrl } from '../src/core/media/store.ts'
import { importedItemPublicId } from '../src/core/items/identity.ts'
import { matchDish, matchFacet } from '../src/core/taxonomy/menuTaxonomy.ts'
import { classifyMenuBranchScope } from '../src/core/places/branchScope.ts'
import { parseTopMenuSelection, selectTopMenuCafes, type TopMenuSelection } from '../src/core/sync/topMenuSelection.ts'

const mode = process.argv[2]
const runId = process.argv[3]
if ((mode !== 'scrape' && mode !== 'apply') || !runId || !/^[A-Za-z0-9_-]{1,100}$/.test(runId)) throw new Error('mode/runId نامعتبر است.')

async function runSelection(kind: 'scrape' | 'apply'): Promise<TopMenuSelection> {
  try {
    const data = JSON.parse(await readFile(join(topMenuSyncRoot, 'runs', runId!, `${kind}-selection.json`), 'utf8'))
    return parseTopMenuSelection(data.scope, data.sourceIds)
  } catch (error) {
    // Existing historical snapshots have no manifest. A malformed manifest is
    // never allowed to become an implicit full sync.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const state = await readTopMenuSyncState()
    const selection = kind === 'apply' ? state.applySelection ?? state.selection : state.selection
    return selection ? parseTopMenuSelection(selection.scope, selection.sourceIds) : { scope: 'all', sourceIds: [] }
  }
}

const CHUNK = 400

interface SourceSection {
  name: string
  description: string | null
  image: string | null
  sortOrder: number
  items: RawMenuItem[]
}

interface ApplyStats {
  createdCafes: number
  createdSections: number
  insertedItems: number
  updatedItems: number
  movedItems: number
  reactivatedItems: number
  archivedItems: number
  mediaRegistered: number
  skipped: number
}

/**
 * دیتابیس فعلی یک سطح دسته دارد. زیردسته‌های منبع در نزدیک‌ترین دستهٔ
 * سطح‌بالا ادغام می‌شوند، اما ترتیب depth-first و تمام آیتم‌ها حفظ می‌شود.
 * نام‌های تکراریِ سطح‌بالا نیز یکی می‌شوند تا دستهٔ تکراری ساخته نشود.
 */
function sourceSections(cafe: RawCafe): SourceSection[] {
  const result: SourceSection[] = []
  const byName = new Map<string, SourceSection>()
  for (const section of cafe['منو'] ?? []) {
    const name = cleanLine(section['دسته‌بندی']) || 'سایر'
    const key = normalizeFa(name)
    const existing = byName.get(key)
    if (existing) {
      existing.items.push(...flattenSectionItems(section))
      continue
    }
    const row: SourceSection = {
      name,
      description: stripHtml(section['توضیحات']) || null,
      image: section['تصویر']?.trim() || null,
      sortOrder: result.length,
      items: flattenSectionItems(section),
    }
    result.push(row)
    byName.set(key, row)
  }
  return result
}

function validateSource(cafes: RawCafe[]): void {
  const cafeIds = new Set<number>()
  const itemOwners = new Map<number, number>()
  for (const cafe of cafes) {
    const cafeId = Number(cafe['شناسه'])
    if (!Number.isInteger(cafeId) || cafeId <= 0) throw new Error(`شناسهٔ نامعتبر برای مجموعه «${cafe['نام مجموعه']}».`)
    if (cafeIds.has(cafeId)) throw new Error(`شناسهٔ تکراری مجموعه در منبع: ${cafeId}`)
    cafeIds.add(cafeId)
    for (const item of flattenCafeItems(cafe)) {
      const itemId = Number(item['شناسه'])
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new Error(`آیتم «${cleanLine(item['نام']) || 'بی‌نام'}» در «${cafe['نام مجموعه']}» شناسهٔ معتبر ندارد.`)
      }
      const owner = itemOwners.get(itemId)
      if (owner !== undefined) throw new Error(`شناسهٔ آیتم ${itemId} در مجموعه‌های ${owner} و ${cafeId} تکرار شده است.`)
      itemOwners.set(itemId, cafeId)
    }
  }
}

function allRawPrices(cafe: RawCafe): number[] {
  return flattenCafeItems(cafe)
    .map((item) => item['قیمت (تومان)'])
    .filter((price): price is number => typeof price === 'number' && price > 0)
}

function itemValues(item: RawMenuItem, context: PriceContext) {
  const name = cleanLine(item['نام'])
  const { price, priceUnknown } = normalizePrice(item['قیمت (تومان)'], context)
  return {
    name,
    nameEn: cleanLine(item['نام انگلیسی']) || null,
    nameNormalized: normalizeFa(name),
    description: stripHtml(rawItemDescription(item['توضیحات'] ?? null)) || null,
    price,
    priceUnknown,
    available: item['موجود است'] !== false,
    featured: item['ویژه است'] === true,
  }
}

async function fail(error: unknown) {
  const current = await readTopMenuSyncState()
  await writeTopMenuSyncState({
    ...current,
    status: 'failed',
    pid: undefined,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  })
}

async function buildReport(cafes: RawCafe[]): Promise<TopMenuSyncReport> {
  const db = getDb()
  const [dbPlaces, dbSections, dbItems] = await Promise.all([
    db.select({ id: placeTable.id, sourceId: placeTable.sourceId, name: placeTable.name, priceUnitFixed: placeTable.priceUnitFixed }).from(placeTable),
    db.select({ id: menuSectionTable.id, placeId: menuSectionTable.placeId, name: menuSectionTable.name }).from(menuSectionTable),
    db.select({
      id: menuItemTable.id,
      sourceId: menuItemTable.sourceId,
      placeId: menuItemTable.placeId,
      sectionId: menuItemTable.sectionId,
      name: menuItemTable.name,
      nameEn: menuItemTable.nameEn,
      description: menuItemTable.description,
      price: menuItemTable.price,
      priceUnknown: menuItemTable.priceUnknown,
      available: menuItemTable.available,
      featured: menuItemTable.featured,
      archivedAt: menuItemTable.archivedAt,
    }).from(menuItemTable),
  ])
  const placeBySource = new Map(dbPlaces.filter((row) => row.sourceId !== null).map((row) => [Number(row.sourceId), row]))
  const itemBySource = new Map(dbItems.filter((row) => row.sourceId !== null).map((row) => [Number(row.sourceId), row]))
  const sectionsByPlace = new Map<number, typeof dbSections>()
  const itemsByPlace = new Map<number, typeof dbItems>()
  for (const section of dbSections) {
    const rows = sectionsByPlace.get(section.placeId) ?? []
    rows.push(section)
    sectionsByPlace.set(section.placeId, rows)
  }
  for (const item of dbItems) {
    const rows = itemsByPlace.get(item.placeId) ?? []
    rows.push(item)
    itemsByPlace.set(item.placeId, rows)
  }

  const changes: TopMenuPriceChange[] = []
  const newCafes: TopMenuSyncReport['newCafes'] = []
  const newItems: TopMenuSyncReport['newItems'] = []
  const conflicts: TopMenuSyncReport['conflicts'] = []
  const cafeStats = new Map<number, TopMenuSyncReport['cafes'][number]>()
  const { thousandUnitThreshold } = await getDataPolicy()
  let matchedCafes = 0
  let matchedItems = 0
  let unchangedItems = 0
  let totalNewItems = 0
  let totalNewSections = 0
  let totalUpdatedItems = 0
  let totalMovedItems = 0
  let totalReactivatedItems = 0
  let totalArchivedItems = 0
  let totalConflicts = 0
  let priceChanges = 0
  let priceIncreases = 0
  let priceDecreases = 0
  let availabilityChanges = 0

  const statFor = (placeId: number, name: string) => {
    const current = cafeStats.get(placeId) ?? {
      placeId, name, priceChanges: 0, priceIncreases: 0, priceDecreases: 0,
      availabilityChanges: 0, newItems: 0, movedItems: 0, archivedItems: 0,
    }
    cafeStats.set(placeId, current)
    return current
  }

  for (const cafe of cafes) {
    const sourceId = Number(cafe['شناسه'])
    const sections = sourceSections(cafe)
    const flatItems = sections.flatMap((section) => section.items)
    const matchedPlace = placeBySource.get(sourceId)
    if (!matchedPlace) {
      for (const item of flatItems) if (itemBySource.has(Number(item['شناسه']))) {
        totalConflicts++
        conflicts.push({ sourceId: Number(item['شناسه']), sourceCafeId: sourceId, placeName: cafe['نام مجموعه'], name: cleanLine(item['نام']), reason: 'این شناسهٔ آیتم به مجموعهٔ دیگری متصل است.' })
      }
      const context = detectPriceContext(allRawPrices(cafe), thousandUnitThreshold)
      newCafes.push({
        sourceId,
        name: cleanLine(cafe['نام مجموعه']) || 'بی‌نام',
        username: cleanLine(cafe['یوزرنیم']),
        sections: sections.length,
        items: flatItems.length,
      })
      totalNewSections += sections.length
      totalNewItems += flatItems.length
      for (const section of sections) {
        for (const item of section.items) {
          const values = itemValues(item, context)
          newItems.push({ sourceId: Number(item['شناسه']), sourceCafeId: sourceId, placeName: cleanLine(cafe['نام مجموعه']), sectionName: section.name, name: values.name, price: values.price })
        }
      }
      continue
    }

    matchedCafes++
    const existingSections = sectionsByPlace.get(matchedPlace.id) ?? []
    const sectionByName = new Map(existingSections.map((section) => [normalizeFa(section.name), section]))
    const sourceItemIds = new Set<number>()
    const context: PriceContext = { thousandUnit: matchedPlace.priceUnitFixed, threshold: thousandUnitThreshold }
    const stat = statFor(matchedPlace.id, matchedPlace.name)

    for (const section of sections) {
      const targetSection = sectionByName.get(normalizeFa(section.name))
      if (!targetSection) totalNewSections++
      for (const item of section.items) {
        const sourceItemId = Number(item['شناسه'])
        sourceItemIds.add(sourceItemId)
        const values = itemValues(item, context)
        const existing = itemBySource.get(sourceItemId)
        if (!existing) {
          totalNewItems++
          stat.newItems++
          newItems.push({ sourceId: sourceItemId, sourceCafeId: sourceId, placeName: matchedPlace.name, sectionName: section.name, name: values.name, price: values.price })
          continue
        }
        if (existing.placeId !== matchedPlace.id) {
          totalConflicts++
          conflicts.push({ sourceId: sourceItemId, sourceCafeId: sourceId, placeName: matchedPlace.name, name: values.name, reason: 'این source_id اکنون به مجموعهٔ دیگری متصل است.' })
          continue
        }
        matchedItems++
        const moved = !targetSection || existing.sectionId !== targetSection.id
        const reactivated = existing.archivedAt !== null
        const contentChanged = existing.name !== values.name
          || existing.nameEn !== values.nameEn
          || existing.description !== values.description
          || existing.price !== values.price
          || existing.priceUnknown !== values.priceUnknown
          || existing.available !== values.available
          || existing.featured !== values.featured
        if (moved) { totalMovedItems++; stat.movedItems++ }
        if (reactivated) totalReactivatedItems++
        if (contentChanged || moved || reactivated) totalUpdatedItems++
        else unchangedItems++

        if (existing.price !== values.price || existing.available !== values.available) {
          if (existing.price !== values.price) {
            priceChanges++; stat.priceChanges++
            if (existing.price !== null && values.price !== null && values.price > existing.price) { priceIncreases++; stat.priceIncreases++ }
            if (existing.price !== null && values.price !== null && values.price < existing.price) { priceDecreases++; stat.priceDecreases++ }
          }
          if (existing.available !== values.available) { availabilityChanges++; stat.availabilityChanges++ }
          changes.push({
            itemId: existing.id,
            sourceItemId,
            placeId: matchedPlace.id,
            placeName: matchedPlace.name,
            itemName: existing.name,
            oldPrice: existing.price,
            newPrice: values.price,
            oldAvailable: existing.available,
            newAvailable: values.available,
          })
        }
      }
    }

    if (sourceItemIds.size > 0) {
      for (const existing of itemsByPlace.get(matchedPlace.id) ?? []) {
        if (existing.sourceId !== null && !sourceItemIds.has(existing.sourceId) && existing.archivedAt === null) {
          totalArchivedItems++
          stat.archivedItems++
        }
      }
    }
  }

  const failedFile = (await readdir(join(topMenuSyncRoot, 'runs', runId))).find((name) => name.startsWith('failed_') && name.endsWith('.json'))
  const failedCafes = failedFile ? (JSON.parse(await readFile(join(topMenuSyncRoot, 'runs', runId, failedFile), 'utf8')) as unknown[]).length : 0
  return {
    reportVersion: 2,
    totalChanges: totalUpdatedItems + totalNewItems + totalArchivedItems + newCafes.length,
    totalNewCafes: newCafes.length,
    totalNewItems,
    totalNewSections,
    totalUpdatedItems,
    totalMovedItems,
    totalReactivatedItems,
    totalArchivedItems,
    totalConflicts,
    priceChanges,
    priceIncreases,
    priceDecreases,
    availabilityChanges,
    sourceCafes: cafes.length,
    matchedCafes,
    matchedItems,
    unchangedItems,
    failedCafes,
    newCafes,
    newItems,
    conflicts,
    changes,
    cafes: [...cafeStats.values()]
      .filter((stat) => stat.priceChanges || stat.availabilityChanges || stat.newItems || stat.movedItems || stat.archivedItems)
      .sort((a, b) => (b.priceChanges + b.newItems + b.movedItems + b.archivedItems) - (a.priceChanges + a.newItems + a.movedItems + a.archivedItems)),
  }
}

async function scrape() {
  const runDir = join(topMenuSyncRoot, 'runs', runId)
  await mkdir(runDir, { recursive: true })
  const selection = await runSelection('scrape')
  if (process.env.TOPMENU_SYNC_SOURCE_FILE) {
    await copyFile(process.env.TOPMENU_SYNC_SOURCE_FILE, join(runDir, 'cafes_full_latest.json'))
  } else {
    const log = createWriteStream(join(runDir, 'scrape.log'), { flags: 'a' })
    const args = ['topmarket.py', '--out', runDir, '--delay', '1.2']
    if (selection.scope === 'selected') {
      const idsFile = join(runDir, 'provider-ids.json')
      const { writeFile } = await import('node:fs/promises')
      await writeFile(idsFile, JSON.stringify(selection.sourceIds), { mode: 0o600 })
      args.push('--provider-ids-file', idsFile)
    }
    const child = spawn('python3', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    const [code] = await once(child, 'close') as [number]
    log.end()
    if (code !== 0) throw new Error(`اسکرپر با کد ${code} متوقف شد؛ لاگ اجرا را بررسی کنید.`)
  }

  const cafes = selectTopMenuCafes(JSON.parse(await readFile(join(runDir, 'cafes_full_latest.json'), 'utf8')) as RawCafe[], selection)
  validateSource(cafes)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(join(runDir, 'cafes_full_latest.json'), JSON.stringify(cafes), 'utf8')
  const report = await buildReport(cafes)
  const current = await readTopMenuSyncState()
  await writeTopMenuSyncState({ ...current, runId, selection, status: 'ready', pid: undefined, finishedAt: new Date().toISOString(), report })
}

async function runNodeScript(script: string, args: string[], logPath: string): Promise<void> {
  const log = createWriteStream(logPath, { flags: 'a' })
  const child = spawn(process.execPath, ['--import', 'tsx', '--conditions=react-server', script, ...args], {
    cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)
  const [code] = await once(child, 'close') as [number]
  log.end()
  if (code !== 0) throw new Error(`اجرای ${script} با کد ${code} شکست خورد؛ ${logPath} را بررسی کنید.`)
}

async function apply() {
  const current = await readTopMenuSyncState()
  if (!current.report) throw new Error('گزارش آماده پیدا نشد.')

  const runDir = join(topMenuSyncRoot, 'runs', runId)
  const selection = await runSelection('apply')
  const cafes = selectTopMenuCafes(JSON.parse(await readFile(join(runDir, 'cafes_full_latest.json'), 'utf8')) as RawCafe[], selection)
  validateSource(cafes)
  const selectedReport = await buildReport(cafes)
  if (selectedReport.totalConflicts > 0) throw new Error(`${selectedReport.totalConflicts} تداخل شناسه در کافه‌های انتخاب‌شده وجود دارد؛ هیچ داده‌ای تغییر نکرد.`)

  const backup = join('backups', `kucafe-before-topmenu-${runId}.sql.gz`)
  const backupChild = spawn(process.execPath, ['scripts/backup-db.mjs', backup], { cwd: process.cwd(), env: process.env, stdio: 'ignore' })
  const [backupCode] = await once(backupChild, 'close') as [number]
  if (backupCode !== 0) throw new Error('بکاپ قبل از اعمال تغییرات ساخته نشد؛ هیچ داده‌ای تغییر نکرد.')

  const db = getDb()
  const policy = await getDataPolicy()
  const stats: ApplyStats = {
    createdCafes: 0, createdSections: 0, insertedItems: 0, updatedItems: 0,
    movedItems: 0, reactivatedItems: 0, archivedItems: 0, mediaRegistered: 0, skipped: 0,
  }
  const affected = new Set<number>()
  const verifiedAt = new Date()

  await db.transaction(async (tx) => {
    const images = extractSourceImages(cafes)
    const existingMedia = await tx.select({ urlHash: mediaTable.urlHash }).from(mediaTable)
    const knownHashes = new Set(existingMedia.map((row) => row.urlHash))
    const mediaRows = images.map((image) => ({ urlHash: hashUrl(image.url), sourceUrl: image.url, kind: image.kind, status: 'pending' as const }))
    stats.mediaRegistered = mediaRows.filter((row) => !knownHashes.has(row.urlHash)).length
    for (let index = 0; index < mediaRows.length; index += CHUNK) {
      await tx.insert(mediaTable).values(mediaRows.slice(index, index + CHUNK)).onDuplicateKeyUpdate({ set: { urlHash: sql`url_hash` } })
    }
    const allMedia = await tx.select({ id: mediaTable.id, urlHash: mediaTable.urlHash }).from(mediaTable)
    const mediaByHash = new Map(allMedia.map((row) => [row.urlHash, row.id]))
    const mediaIdFor = (url: string | null | undefined) => url?.trim() ? mediaByHash.get(hashUrl(url.trim())) ?? null : null

    const [places, sections, items, dishes] = await Promise.all([
      tx.select().from(placeTable), tx.select().from(menuSectionTable), tx.select().from(menuItemTable),
      tx.select({ id: dishTable.id, slug: dishTable.slug }).from(dishTable),
    ])
    const placeBySource = new Map(places.filter((row) => row.sourceId !== null).map((row) => [Number(row.sourceId), row]))
    const itemBySource = new Map(items.filter((row) => row.sourceId !== null).map((row) => [Number(row.sourceId), row]))
    const sectionsByPlace = new Map<number, typeof sections>()
    const itemsByPlace = new Map<number, typeof items>()
    for (const section of sections) {
      const rows = sectionsByPlace.get(section.placeId) ?? []; rows.push(section); sectionsByPlace.set(section.placeId, rows)
    }
    for (const item of items) {
      const rows = itemsByPlace.get(item.placeId) ?? []; rows.push(item); itemsByPlace.set(item.placeId, rows)
    }
    const dishBySlug = new Map(dishes.map((dish) => [dish.slug, dish.id]))
    const usedSlugs = new Set(places.map((row) => row.slug))

    for (const cafe of cafes) {
      const cafeSourceId = Number(cafe['شناسه'])
      const canonicalSections = sourceSections(cafe)
      const flatItems = canonicalSections.flatMap((section) => section.items)
      let placeRow = placeBySource.get(cafeSourceId)
      let context: PriceContext

      if (!placeRow) {
        const name = cleanLine(cafe['نام مجموعه']) || `مجموعه ${cafeSourceId}`
        const prices = allRawPrices(cafe)
        context = detectPriceContext(prices, policy.thousandUnitThreshold)
        const normalizedPrices = prices.map((price) => normalizePrice(price, context).price).filter((price): price is number => price !== null)
        const kindSignal = detectKind(name, canonicalSections.map((section) => section.name), flatItems.map((item) => cleanLine(item['نام'])))
        const lat = cafe['عرض جغرافیایی (lat)']
        const lng = cafe['طول جغرافیایی (lng)']
        const geoStatus = classifyGeo(lat, lng, policy.bbox)
        const address = cleanLine(cafe['آدرس متنی'])
        const districtId = pickDistrict(address, lat, lng, policy.districtMatchMaxKm)
        const hours = parseHours(cafe['ساعات کاری'])
        const phones = parsePhones(cafe['شماره تماس‌ها'])
        const socials = parseSocials(cafe['سایر شبکه‌های اجتماعی'])
        const instagram = parseInstagramHandle(cafe['اینستاگرام'])
        const about = stripHtml(cafe['درباره'])
        const slug = makeSlug(cafe['یوزرنیم'], name, (candidate) => usedSlugs.has(candidate))
        usedSlugs.add(slug)
        let signatureItem: string | null = null
        let signaturePrice = -1
        for (const item of flatItems) {
          if (item['ویژه است'] !== true) continue
          const price = normalizePrice(item['قیمت (تومان)'], context).price ?? 0
          if (price > signaturePrice) { signaturePrice = price; signatureItem = cleanLine(item['نام']) }
        }
        const [created] = await tx.insert(placeTable).values({
          slug, sourceId: cafeSourceId, sourceUsername: cleanLine(cafe['یوزرنیم']) || null,
          name, nameEn: cleanLine(cafe['نام انگلیسی']) || null, nameNormalized: normalizeFa(name),
          kind: kindSignal.kind, status: kindSignal.kind === 'shop' ? 'draft' : 'published',
          lat: geoStatus === 'missing' ? null : (lat as number).toFixed(7),
          lng: geoStatus === 'missing' ? null : (lng as number).toFixed(7), geoStatus,
          address, districtId,
          priceTier: priceTierFromMedian(median(normalizedPrices), policy.priceTierBounds),
          priceMin: normalizedPrices.length ? Math.min(...normalizedPrices) : null,
          priceMedian: median(normalizedPrices), priceMax: normalizedPrices.length ? Math.max(...normalizedPrices) : null,
          priceUnitFixed: context.thousandUnit, menuUrl: cleanLine(cafe['لینک منو']) || null,
          instagram, about: about || null, logoMediaId: mediaIdFor(cafe['لوگو']), signatureItem,
          qualityScore: computeQualityFromFacts({
            hasCoords: geoStatus !== 'missing', hasHours: hours.shifts.some((shift) => !shift.closed),
            hasAddress: !!address, hasPhone: phones.length > 0, hasInstagram: !!instagram,
            hasDescription: !!about, hasMenu: flatItems.length > 0, photoCount: cafe['لوگو'] ? 1 : 0, attributeCount: 0,
          }),
          source: 'import', lastVerifiedAt: verifiedAt,
        }).$returningId()
        const placeId = created!.id
        placeRow = (await tx.select().from(placeTable).where(eq(placeTable.id, placeId)).limit(1))[0]!
        placeBySource.set(cafeSourceId, placeRow)
        sectionsByPlace.set(placeId, [])
        itemsByPlace.set(placeId, [])
        stats.createdCafes++
        if (phones.length) await tx.insert(placePhoneTable).values(phones.map((phone, sortOrder) => ({ placeId, phone: phone.phone, kind: phone.kind, sortOrder })))
        const socialRows = [...socials]
        if (instagram) socialRows.unshift({ kind: 'instagram', label: 'اینستاگرام', url: `https://instagram.com/${instagram}`, handle: instagram })
        if (socialRows.length) await tx.insert(placeSocialTable).values(socialRows.map((social) => ({ placeId, kind: social.kind, label: social.label, url: social.url, handle: social.handle })))
        if (hours.shifts.length) await tx.insert(placeHoursTable).values(hours.shifts.map((shift) => ({ placeId, dow: shift.dow, shiftIndex: shift.shiftIndex, opensAt: shift.opensAt, closesAt: shift.closesAt, crossesMidnight: shift.crossesMidnight, closed: shift.closed })))
      } else {
        context = { thousandUnit: placeRow.priceUnitFixed, threshold: policy.thousandUnitThreshold }
        await tx.update(placeTable).set({ lastVerifiedAt: verifiedAt }).where(eq(placeTable.id, placeRow.id))
      }

      const placeId = placeRow.id
      affected.add(placeId)
      const existingSections = sectionsByPlace.get(placeId) ?? []
      const sectionByName = new Map(existingSections.map((section) => [normalizeFa(section.name), section]))
      const sourceItemIds = new Set<number>()

      for (const section of canonicalSections) {
        const sectionKey = normalizeFa(section.name)
        let targetSection = sectionByName.get(sectionKey)
        const facetId = matchFacet(section.name)
        const scope = classifyMenuBranchScope(section.name, placeRow.branchName)
        if (!targetSection) {
          const [created] = await tx.insert(menuSectionTable).values({ placeId, name: section.name, description: section.description, mediaId: mediaIdFor(section.image), facetId, ...scope, sortOrder: section.sortOrder }).$returningId()
          targetSection = { id: created!.id, placeId, name: section.name, nameEn: null, description: section.description, mediaId: mediaIdFor(section.image), facetId, ...scope, sortOrder: section.sortOrder }
          sectionByName.set(sectionKey, targetSection)
          existingSections.push(targetSection)
          stats.createdSections++
        } else {
          const sectionMediaId = mediaIdFor(section.image)
          if (targetSection.name !== section.name || targetSection.description !== section.description
            || targetSection.mediaId !== sectionMediaId || targetSection.facetId !== facetId
            || targetSection.branchScope !== scope.branchScope || targetSection.branchLabel !== scope.branchLabel
            || targetSection.sortOrder !== section.sortOrder) {
            await tx.update(menuSectionTable).set({ name: section.name, description: section.description, mediaId: sectionMediaId, facetId, ...scope, sortOrder: section.sortOrder }).where(eq(menuSectionTable.id, targetSection.id))
          }
        }

        const inserts: (typeof menuItemTable.$inferInsert)[] = []
        for (const [itemIndex, sourceItem] of section.items.entries()) {
          const sourceItemId = Number(sourceItem['شناسه'])
          sourceItemIds.add(sourceItemId)
          const values = itemValues(sourceItem, context)
          const dishSlug = matchDish(values.name, facetId, {
            price: values.price,
            sectionName: section.name,
          })
          const dishId = dishSlug ? dishBySlug.get(dishSlug) ?? null : null
          const mediaId = mediaIdFor(sourceItem['تصویر'])
          const existing = itemBySource.get(sourceItemId)
          if (!existing) {
            inserts.push({ publicId: importedItemPublicId(sourceItemId, cafeSourceId, section.sortOrder, itemIndex), placeId, sectionId: targetSection.id, sourceId: sourceItemId, ...values, mediaId, dishId, sortOrder: itemIndex, archivedAt: null, priceUpdatedAt: verifiedAt })
            continue
          }
          if (existing.placeId !== placeId) { stats.skipped++; continue }
          const moved = existing.sectionId !== targetSection.id
          const reactivated = existing.archivedAt !== null
          const changed = moved || reactivated || existing.name !== values.name || existing.nameEn !== values.nameEn
            || existing.description !== values.description || existing.price !== values.price
            || existing.priceUnknown !== values.priceUnknown || existing.available !== values.available
            || existing.featured !== values.featured || existing.mediaId !== mediaId
            || existing.dishId !== dishId || existing.sortOrder !== itemIndex
          if (!changed) continue
          await tx.update(menuItemTable).set({ sectionId: targetSection.id, ...values, mediaId, dishId, sortOrder: itemIndex, archivedAt: null, priceUpdatedAt: existing.price !== values.price ? verifiedAt : existing.priceUpdatedAt }).where(eq(menuItemTable.id, existing.id))
          stats.updatedItems++
          if (moved) stats.movedItems++
          if (reactivated) stats.reactivatedItems++
        }
        for (let index = 0; index < inserts.length; index += CHUNK) await tx.insert(menuItemTable).values(inserts.slice(index, index + CHUNK))
        stats.insertedItems += inserts.length
      }

      // source_id خالی یعنی آیتم دستی کافه‌دار و هرگز با sync آرشیو نمی‌شود.
      if (sourceItemIds.size > 0) {
        const archiveIds = (itemsByPlace.get(placeId) ?? []).filter((item) => item.sourceId !== null && !sourceItemIds.has(item.sourceId) && item.archivedAt === null).map((item) => item.id)
        for (let index = 0; index < archiveIds.length; index += CHUNK) {
          await tx.update(menuItemTable).set({ archivedAt: verifiedAt }).where(inArray(menuItemTable.id, archiveIds.slice(index, index + CHUNK)))
        }
        stats.archivedItems += archiveIds.length
      }
    }

    // گارد اتمیک کامل‌بودن: پیش از COMMIT، خود snapshot را دوباره از دیتابیس
    // می‌خوانیم. هر مغایرت باعث throw و rollback کل عملیات می‌شود.
    const [verifiedPlaces, verifiedSections, verifiedItems] = await Promise.all([
      tx.select({ id: placeTable.id, sourceId: placeTable.sourceId, priceUnitFixed: placeTable.priceUnitFixed }).from(placeTable).where(isNotNull(placeTable.sourceId)),
      tx.select({ id: menuSectionTable.id, placeId: menuSectionTable.placeId, name: menuSectionTable.name }).from(menuSectionTable),
      tx.select({
        sourceId: menuItemTable.sourceId,
        placeId: menuItemTable.placeId,
        sectionId: menuItemTable.sectionId,
        name: menuItemTable.name,
        price: menuItemTable.price,
        available: menuItemTable.available,
        archivedAt: menuItemTable.archivedAt,
      }).from(menuItemTable).where(isNotNull(menuItemTable.sourceId)),
    ])
    const verifiedPlaceBySource = new Map(verifiedPlaces.map((row) => [Number(row.sourceId), row]))
    const verifiedSectionByPlaceAndName = new Map(verifiedSections.map((row) => [`${row.placeId}|${normalizeFa(row.name)}`, row]))
    const verifiedItemBySource = new Map(verifiedItems.map((row) => [Number(row.sourceId), row]))
    const verificationErrors: string[] = []
    let expectedItems = 0
    for (const cafe of cafes) {
      const cafeSourceId = Number(cafe['شناسه'])
      const verifiedPlace = verifiedPlaceBySource.get(cafeSourceId)
      if (!verifiedPlace) {
        verificationErrors.push(`مجموعهٔ ${cafeSourceId} درج نشده`)
        continue
      }
      const verifyContext: PriceContext = { thousandUnit: verifiedPlace.priceUnitFixed, threshold: policy.thousandUnitThreshold }
      for (const section of sourceSections(cafe)) {
        const verifiedSection = verifiedSectionByPlaceAndName.get(`${verifiedPlace.id}|${normalizeFa(section.name)}`)
        if (!verifiedSection) verificationErrors.push(`دستهٔ «${section.name}» برای مجموعهٔ ${cafeSourceId} درج نشده`)
        for (const sourceItem of section.items) {
          expectedItems++
          const sourceItemId = Number(sourceItem['شناسه'])
          const actual = verifiedItemBySource.get(sourceItemId)
          const expected = itemValues(sourceItem, verifyContext)
          if (!actual) verificationErrors.push(`آیتم ${sourceItemId} درج نشده`)
          else if (actual.placeId !== verifiedPlace.id) verificationErrors.push(`آیتم ${sourceItemId} به مجموعهٔ اشتباه متصل است`)
          else if (actual.archivedAt !== null) verificationErrors.push(`آیتم ${sourceItemId} به‌اشتباه آرشیو است`)
          else if (verifiedSection && actual.sectionId !== verifiedSection.id) verificationErrors.push(`دستهٔ آیتم ${sourceItemId} درست نیست`)
          else if (actual.name !== expected.name || actual.price !== expected.price || actual.available !== expected.available) verificationErrors.push(`محتوای آیتم ${sourceItemId} با منبع یکی نیست`)
          if (verificationErrors.length >= 20) break
        }
        if (verificationErrors.length >= 20) break
      }
      if (verificationErrors.length >= 20) break
    }
    if (verificationErrors.length > 0) {
      throw new Error(`راستی‌آزمایی snapshot شکست خورد (${verificationErrors.join('؛ ')})`)
    }
    const expectedTotalItems = cafes.reduce((sum, cafe) => sum + flattenCafeItems(cafe).length, 0)
    if (expectedItems !== expectedTotalItems) {
      throw new Error('شمارش نهایی آیتم‌های snapshot ناسازگار است؛ عملیات rollback شد.')
    }
  })

  for (const placeId of affected) await refreshPlaceDerived(placeId)
  if (process.env.TOPMENU_SYNC_SMOKE_TEST !== '1') {
    await runNodeScript('scripts/build-facets.ts', [], join(runDir, 'reindex.log'))
    await runNodeScript('scripts/media-download.ts', [], join(runDir, 'media-download.log'))
  }

  await recordAudit(
    { userId: current.actorUserId ?? '', label: current.actorLabel ?? 'admin' },
    'topmenu.full_sync', 'topmenu_sync', runId,
    { proposed: selectedReport.totalChanges, newCafes: selectedReport.totalNewCafes, newItems: selectedReport.totalNewItems, selection },
    { ...stats, affectedCafes: affected.size, sourceIds: cafes.map(cafe => cafe['شناسه']), backup },
  )
  await writeTopMenuSyncState({ ...current, status: 'completed', pid: undefined, appliedAt: new Date().toISOString(), applied: { ...stats, affectedCafes: affected.size, backup } })
}

try {
  if (mode === 'scrape') await scrape()
  else await apply()
} catch (error) {
  await fail(error)
  process.exitCode = 1
} finally {
  await closeDb()
}
