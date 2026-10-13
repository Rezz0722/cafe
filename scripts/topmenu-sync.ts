import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { once } from 'node:events'
import { eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { closeDb, getDb } from '../src/db/connection.ts'
import {
  auditLog,
  dish as dishTable,
  media as mediaTable,
  menuItem as menuItemTable,
  menuItemFieldOverride as itemOverrideTable,
  menuItemVariant as variantTable,
  menuSection as menuSectionTable,
  menuSectionFieldOverride as sectionOverrideTable,
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
import { refreshPlaceDerived } from '../src/core/places/manage.ts'
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
import { parseTopMenuSelection, reconcileTopMenuScrape, selectTopMenuCafes, type TopMenuSelection, type TopMenuSkippedSources } from '../src/core/sync/topMenuSelection.ts'
import { assertTopMenuFailureManifest, failedTopMenuSourceIds, failedTopMenuSelectionIds } from '../src/core/sync/topMenuFailures.ts'
import { readTopMenuRunSourcePresence } from '../src/core/sync/topMenuSourcePresence.ts'
import { isTopMenuSourceExcluded, TOP_MENU_EXCLUDED_SOURCE_IDS } from '../src/core/sync/topMenuExclusions.ts'
import { mergeItemSource, sourceFieldConflicts } from '../src/core/sync/menuOverridePolicy.ts'

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
  protectedFields: number
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

/** A provider rename is inferable only when all already-known source items point to one old provider section. */
function renamedSourceSection<T extends { id: number; placeId: number; sourceName: string | null }>(
  sections: readonly T[],
  sourceItems: readonly RawMenuItem[],
  itemsBySource: Map<number, { placeId: number; sectionId: number }>,
  placeId: number,
  sourceNames: ReadonlySet<string>,
  used: ReadonlySet<number>,
): T | undefined {
  const matched = sourceItems.map(item => itemsBySource.get(Number(item['شناسه']))).filter((item): item is { placeId: number; sectionId: number } => !!item && item.placeId === placeId)
  const ids = new Set(matched.map(item => item.sectionId))
  if (!matched.length || ids.size !== 1) return undefined
  const candidate = sections.find(section => section.id === matched[0]!.sectionId)
  return candidate?.sourceName && !sourceNames.has(normalizeFa(candidate.sourceName)) && !used.has(candidate.id) ? candidate : undefined
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
  const [dbPlaces, dbSections, dbItems, itemOverrides, sectionOverrides, variants, dbMedia] = await Promise.all([
    db.select({ id: placeTable.id, sourceId: placeTable.sourceId, name: placeTable.name, branchName: placeTable.branchName, priceUnitFixed: placeTable.priceUnitFixed }).from(placeTable),
    db.select({ id: menuSectionTable.id, placeId: menuSectionTable.placeId, name: menuSectionTable.name, sourceName: menuSectionTable.sourceName, description: menuSectionTable.description, facetId: menuSectionTable.facetId, mediaId: menuSectionTable.mediaId, branchScope: menuSectionTable.branchScope, branchLabel: menuSectionTable.branchLabel, sortOrder: menuSectionTable.sortOrder }).from(menuSectionTable),
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
      mediaId: menuItemTable.mediaId,
      sortOrder: menuItemTable.sortOrder,
      archivedAt: menuItemTable.archivedAt,
    }).from(menuItemTable),
    db.select({ itemId: itemOverrideTable.itemId, fieldName: itemOverrideTable.fieldName }).from(itemOverrideTable),
    db.select({ sectionId: sectionOverrideTable.sectionId, fieldName: sectionOverrideTable.fieldName }).from(sectionOverrideTable),
    db.select({ itemId: variantTable.itemId }).from(variantTable),
    db.select({ id: mediaTable.id, urlHash: mediaTable.urlHash }).from(mediaTable),
  ])
  const mediaHash = new Map(dbMedia.map(row => [row.id, row.urlHash]))
  const itemFields = new Map<number, Set<string>>()
  for (const row of itemOverrides) itemFields.set(row.itemId, (itemFields.get(row.itemId) ?? new Set()).add(row.fieldName))
  const manuallyProtected = new Map([...itemFields].map(([id, fields]) => [id, new Set(fields)]))
  const variantItemIds = new Set(variants.map(row => row.itemId))
  for (const row of variants) { const fields = itemFields.get(row.itemId) ?? new Set<string>(); fields.add('price'); fields.add('available'); itemFields.set(row.itemId, fields) }
  const sectionFields = new Map<number, Set<string>>()
  for (const row of sectionOverrides) sectionFields.set(row.sectionId, (sectionFields.get(row.sectionId) ?? new Set()).add(row.fieldName))
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
  const protectedChanges: NonNullable<TopMenuSyncReport['protectedChanges']> = []
  const cafeStats = new Map<number, TopMenuSyncReport['cafes'][number]>()
  const { thousandUnitThreshold } = await getDataPolicy()
  let matchedCafes = 0
  let matchedItems = 0
  let unchangedItems = 0
  let totalNewItems = 0
  let totalNewSections = 0
  let totalUpdatedSections = 0
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
      updatedSections: 0,
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
    const importedSectionIds = new Set((itemsByPlace.get(matchedPlace.id) ?? []).filter(item => item.sourceId !== null).map(item => item.sectionId))
    const sectionByName = new Map(existingSections.filter(section => section.sourceName !== null || importedSectionIds.has(section.id)).map((section) => [normalizeFa(section.sourceName ?? section.name), section]))
    const sourceNames = new Set(sections.map(section => normalizeFa(section.name)))
    const usedSections = new Set<number>()
    const sourceItemIds = new Set<number>()
    const context: PriceContext = { thousandUnit: matchedPlace.priceUnitFixed, threshold: thousandUnitThreshold }
    const stat = statFor(matchedPlace.id, matchedPlace.name)

    for (const section of sections) {
      const targetSection = sectionByName.get(normalizeFa(section.name)) ?? renamedSourceSection(existingSections, section.items, itemBySource, matchedPlace.id, sourceNames, usedSections)
      if (targetSection) usedSections.add(targetSection.id)
      if (targetSection) {
        const protectedFields = sectionFields.get(targetSection.id) ?? new Set<string>()
        const scope = classifyMenuBranchScope(section.name, matchedPlace.branchName)
        protectedChanges.push(...sourceFieldConflicts(targetSection, { name: section.name, sortOrder: section.sortOrder, branchScope: scope.branchScope }, protectedFields, 'section', targetSection.id).map(change => ({ ...change, placeId: matchedPlace.id })))
        const imageHash = section.image ? hashUrl(section.image) : null
        if (protectedFields.has('mediaId') && (mediaHash.get(targetSection.mediaId ?? -1) ?? null) !== imageHash)
          protectedChanges.push({ placeId: matchedPlace.id, entity: 'section', entityId: targetSection.id, field: 'mediaId', current: targetSection.mediaId, source: section.image, releasable: true })
        const effectiveName = protectedFields.has('name') ? targetSection.name : section.name
        const effectiveScope = protectedFields.has('branchScope') ? targetSection.branchScope : scope.branchScope
        const effectiveSortOrder = protectedFields.has('sortOrder') ? targetSection.sortOrder : section.sortOrder
        if (targetSection.name !== effectiveName || targetSection.description !== section.description
          || (!protectedFields.has('mediaId') && (mediaHash.get(targetSection.mediaId ?? -1) ?? null) !== imageHash)
          || targetSection.facetId !== matchFacet(effectiveName) || targetSection.branchScope !== effectiveScope
          || (!protectedFields.has('branchScope') && targetSection.branchLabel !== scope.branchLabel)
          || targetSection.sortOrder !== effectiveSortOrder) { totalUpdatedSections++; stat.updatedSections = (stat.updatedSections ?? 0) + 1 }
      }
      if (!targetSection) totalNewSections++
      for (const [itemIndex, item] of section.items.entries()) {
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
        const proposed = { ...existing, ...values, sectionId: targetSection?.id ?? existing.sectionId, sortOrder: itemIndex, archivedAt: null }
        const fields = itemFields.get(existing.id) ?? new Set<string>()
        protectedChanges.push(...sourceFieldConflicts(existing, proposed, fields, 'item', existing.id).map(change => ({ ...change, placeId: matchedPlace.id, releasable: Boolean(manuallyProtected.get(existing.id)?.has(change.field)) && !(variantItemIds.has(existing.id) && (change.field === 'price' || change.field === 'available')) })))
        if (!targetSection && fields.has('sectionId')) protectedChanges.push({ placeId: matchedPlace.id, entity: 'item', entityId: existing.id, field: 'sectionId', current: existing.sectionId, source: `دستهٔ تازه: ${section.name}`, releasable: true })
        const imageHash = item['تصویر']?.trim() ? hashUrl(item['تصویر']!.trim()) : null
        if (fields.has('mediaId') && (mediaHash.get(existing.mediaId ?? -1) ?? null) !== imageHash)
          protectedChanges.push({ placeId: matchedPlace.id, entity: 'item', entityId: existing.id, field: 'mediaId', current: existing.mediaId, source: item['تصویر'] ?? null, releasable: manuallyProtected.get(existing.id)?.has('mediaId') ?? false })
        const effective = mergeItemSource(existing, proposed, fields)
        const moved = targetSection ? existing.sectionId !== effective.sectionId : !fields.has('sectionId')
        const reactivated = existing.archivedAt !== null && effective.archivedAt === null
        const contentChanged = existing.name !== effective.name
          || existing.nameEn !== effective.nameEn
          || existing.description !== effective.description
          || existing.price !== effective.price
          || existing.priceUnknown !== effective.priceUnknown
          || existing.available !== effective.available
          || existing.featured !== effective.featured
          || existing.sortOrder !== effective.sortOrder
          || (!fields.has('mediaId') && (mediaHash.get(existing.mediaId ?? -1) ?? null) !== imageHash)
        if (moved) { totalMovedItems++; stat.movedItems++ }
        if (reactivated) totalReactivatedItems++
        if (contentChanged || moved || reactivated) totalUpdatedItems++
        else unchangedItems++

        if (existing.price !== effective.price || existing.available !== effective.available) {
          if (existing.price !== effective.price) {
            priceChanges++; stat.priceChanges++
            if (existing.price !== null && effective.price !== null && effective.price > existing.price) { priceIncreases++; stat.priceIncreases++ }
            if (existing.price !== null && effective.price !== null && effective.price < existing.price) { priceDecreases++; stat.priceDecreases++ }
          }
          if (existing.available !== effective.available) { availabilityChanges++; stat.availabilityChanges++ }
          changes.push({
            itemId: existing.id,
            sourceItemId,
            placeId: matchedPlace.id,
            placeName: matchedPlace.name,
            itemName: existing.name,
            oldPrice: existing.price,
            newPrice: effective.price,
            oldAvailable: existing.available,
            newAvailable: effective.available,
          })
        }
      }
    }

    if (sourceItemIds.size > 0) {
      for (const existing of itemsByPlace.get(matchedPlace.id) ?? []) {
        if (existing.sourceId !== null && !sourceItemIds.has(existing.sourceId) && existing.archivedAt === null && itemFields.get(existing.id)?.has('archivedAt')) {
          protectedChanges.push({ placeId: matchedPlace.id, entity: 'item', entityId: existing.id, field: 'archivedAt', current: null, source: 'غایب از منبع؛ آرشیو پیشنهادی', releasable: true })
        }
        if (existing.sourceId !== null && !sourceItemIds.has(existing.sourceId) && existing.archivedAt === null && !itemFields.get(existing.id)?.has('archivedAt')) {
          totalArchivedItems++
          stat.archivedItems++
        }
      }
    }
  }

  const failedCafes = (await failedTopMenuSourceIds(join(topMenuSyncRoot, 'runs', runId))).length
  return {
    protectedChanges,
    protectedCount: protectedChanges.length,
    reportVersion: 2,
    totalChanges: totalUpdatedItems + totalUpdatedSections + totalNewSections + totalNewItems + totalArchivedItems + newCafes.length,
    totalNewCafes: newCafes.length,
    totalNewItems,
    totalNewSections,
    totalUpdatedSections,
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
      .filter((stat) => stat.priceChanges || stat.availabilityChanges || stat.newItems || stat.movedItems || stat.archivedItems || stat.updatedSections)
      .sort((a, b) => (b.priceChanges + b.newItems + b.movedItems + b.archivedItems) - (a.priceChanges + a.newItems + a.movedItems + a.archivedItems)),
  }
}

async function scrape() {
  const runDir = join(topMenuSyncRoot, 'runs', runId)
  await mkdir(runDir, { recursive: true })
  const selection = await runSelection('scrape')
  const eligibleIds = selection.scope === 'selected' ? selection.sourceIds.filter(id => !isTopMenuSourceExcluded(id)) : []
  if (selection.scope === 'selected' && !eligibleIds.length)
    throw new Error('هیچ کافهٔ قابل اسکرپی در انتخاب نیست؛ همهٔ موارد انتخابی غیرکافه یا دمو هستند.')
  if (process.env.TOPMENU_SYNC_SOURCE_FILE) {
    await copyFile(process.env.TOPMENU_SYNC_SOURCE_FILE, join(runDir, 'cafes_full_latest.json'))
  } else {
    const log = createWriteStream(join(runDir, 'scrape.log'), { flags: 'a' })
    const args = ['topmarket.py', '--out', runDir, '--delay', '1.2']
    const excludedFile = join(runDir, 'excluded-provider-ids.json')
    await writeFile(excludedFile, JSON.stringify(TOP_MENU_EXCLUDED_SOURCE_IDS), { mode: 0o600 })
    args.push('--exclude-provider-ids-file', excludedFile)
    if (selection.scope === 'selected') {
      const idsFile = join(runDir, 'provider-ids.json')
      await writeFile(idsFile, JSON.stringify(eligibleIds), { mode: 0o600 })
      args.push('--provider-ids-file', idsFile)
    }
    // stdout is a pipe, not a terminal: without -u Python buffers progress
    // until the buffer fills or the scrape exits, making the live UI appear stuck.
    const child = spawn('python3', ['-u', ...args], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log)
    child.stderr.pipe(log)
    const [code] = await once(child, 'close') as [number]
    log.end()
    if (code !== 0) throw new Error(`اسکرپر با کد ${code} متوقف شد؛ لاگ اجرا را بررسی کنید.`)
  }

  const rawCafes = JSON.parse(await readFile(join(runDir, 'cafes_full_latest.json'), 'utf8')) as RawCafe[]
  let cafes: RawCafe[]
  let skippedSources: TopMenuSkippedSources = { excluded: [], missing: [], incomplete: [] }
  if (process.env.TOPMENU_SYNC_SOURCE_FILE) {
    cafes = selectTopMenuCafes(rawCafes, selection)
  } else {
    const sourceIds = await readTopMenuRunSourcePresence(topMenuSyncRoot, runId)
    if (!sourceIds) throw new Error('فهرست کامل و معتبر مجموعه‌های منبع برای این اجرا ثبت نشده است؛ گزارش ناقص پذیرفته نمی‌شود.')
    const result = reconcileTopMenuScrape(rawCafes, selection, sourceIds, await failedTopMenuSourceIds(runDir))
    cafes = result.cafes
    skippedSources = result.skipped
  }
  validateSource(cafes)
  await writeFile(join(runDir, 'cafes_full_latest.json'), JSON.stringify(cafes), 'utf8')
  const report = await buildReport(cafes)
  report.skippedSources = skippedSources
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
  const failed = await failedTopMenuSourceIds(runDir)
  assertTopMenuFailureManifest(current.report.failedCafes, failed)
  const blocked = failedTopMenuSelectionIds(failed, selection)
  if (blocked.length) throw new Error(`دادهٔ ${blocked.length} کافه از منبع ناقص است (${blocked.slice(0, 10).join('، ')}). هیچ داده‌ای اعمال نشد.`)
  const selectedReport = await buildReport(cafes)
  if (selectedReport.totalConflicts > 0) throw new Error(`${selectedReport.totalConflicts} تداخل شناسه در کافه‌های انتخاب‌شده وجود دارد؛ هیچ داده‌ای تغییر نکرد.`)

  const backup = join(process.env.TOPMENU_SYNC_BACKUP_DIR || 'backups', `kucafe-before-topmenu-${runId}.sql.gz`)
  const backupLog = createWriteStream(join(runDir, 'backup.log'), { flags: 'a' })
  const backupChild = spawn(process.execPath, ['scripts/backup-db.mjs', backup], { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
  backupChild.stdout.pipe(backupLog, { end: false })
  backupChild.stderr.pipe(backupLog, { end: false })
  const [backupCode] = await once(backupChild, 'close') as [number]
  backupLog.end()
  await once(backupLog, 'finish')
  if (backupCode !== 0) throw new Error('بکاپ قبل از اعمال تغییرات ساخته نشد؛ هیچ داده‌ای تغییر نکرد. جزئیات در backup.log همین اجرا ثبت شد.')

  const db = getDb()
  const policy = await getDataPolicy()
  const stats: ApplyStats = {
    createdCafes: 0, createdSections: 0, insertedItems: 0, updatedItems: 0,
    movedItems: 0, reactivatedItems: 0, archivedItems: 0, mediaRegistered: 0, skipped: 0,
    protectedFields: 0,
  }
  const affected = new Set<number>()
  const appliedAt = new Date()
  const targetPlaceRows = await db.select({ id: placeTable.id }).from(placeTable)
    .where(inArray(placeTable.sourceId, cafes.map(cafe => Number(cafe['شناسه']))))
  const targetPlaceIds = targetPlaceRows.map(row => row.id)

  await db.transaction(async (tx) => {
    // Lock only selected menu rows before the first consistent read. Section
    // then item order follows venue writes, avoiding a place/item lock cycle.
    // A concurrent edit either commits first and is observed, or waits until
    // after sync and wins. No lock is taken on unrelated venues.
    if (targetPlaceIds.length) {
      await tx.select({ id: menuSectionTable.id }).from(menuSectionTable).where(inArray(menuSectionTable.placeId, targetPlaceIds)).for('update')
      await tx.select({ id: menuItemTable.id }).from(menuItemTable).where(inArray(menuItemTable.placeId, targetPlaceIds)).for('update')
    }
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

    const [places, sections, items, dishes, itemOverrides, sectionOverrides, variants] = await Promise.all([
      tx.select().from(placeTable), tx.select().from(menuSectionTable), tx.select().from(menuItemTable),
      tx.select({ id: dishTable.id, slug: dishTable.slug }).from(dishTable),
      tx.select({ itemId: itemOverrideTable.itemId, fieldName: itemOverrideTable.fieldName }).from(itemOverrideTable),
      tx.select({ sectionId: sectionOverrideTable.sectionId, fieldName: sectionOverrideTable.fieldName }).from(sectionOverrideTable),
      tx.select({ itemId: variantTable.itemId }).from(variantTable),
    ])
    const itemFields = new Map<number, Set<string>>()
    for (const row of itemOverrides) itemFields.set(row.itemId, (itemFields.get(row.itemId) ?? new Set()).add(row.fieldName))
    for (const row of variants) { const fields = itemFields.get(row.itemId) ?? new Set<string>(); fields.add('price'); fields.add('available'); itemFields.set(row.itemId, fields) }
    const sectionFields = new Map<number, Set<string>>()
    for (const row of sectionOverrides) sectionFields.set(row.sectionId, (sectionFields.get(row.sectionId) ?? new Set()).add(row.fieldName))
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
          source: 'import', lastSourceSyncAt: appliedAt,
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
        await tx.update(placeTable).set({ lastSourceSyncAt: appliedAt }).where(eq(placeTable.id, placeRow.id))
      }

      const placeId = placeRow.id
      affected.add(placeId)
      const existingSections = sectionsByPlace.get(placeId) ?? []
      const importedSectionIds = new Set((itemsByPlace.get(placeId) ?? []).filter(item => item.sourceId !== null).map(item => item.sectionId))
      const sectionByName = new Map(existingSections.filter(section => section.sourceName !== null || importedSectionIds.has(section.id)).map((section) => [normalizeFa(section.sourceName ?? section.name), section]))
      const sourceNames = new Set(canonicalSections.map(section => normalizeFa(section.name)))
      const usedSections = new Set<number>()
      const sourceItemIds = new Set<number>()

      for (const section of canonicalSections) {
        const sectionKey = normalizeFa(section.name)
        let targetSection = sectionByName.get(sectionKey) ?? renamedSourceSection(existingSections, section.items, itemBySource, placeId, sourceNames, usedSections)
        if (targetSection) usedSections.add(targetSection.id)
        const facetId = matchFacet(section.name)
        const scope = classifyMenuBranchScope(section.name, placeRow.branchName)
        if (!targetSection) {
          const [created] = await tx.insert(menuSectionTable).values({ placeId, name: section.name, sourceName: section.name, description: section.description, mediaId: mediaIdFor(section.image), facetId, ...scope, sortOrder: section.sortOrder }).$returningId()
          targetSection = { id: created!.id, placeId, name: section.name, sourceName: section.name, nameEn: null, description: section.description, mediaId: mediaIdFor(section.image), facetId, ...scope, sortOrder: section.sortOrder }
          sectionByName.set(sectionKey, targetSection)
          existingSections.push(targetSection)
          stats.createdSections++
        } else {
          const sectionMediaId = mediaIdFor(section.image)
          const protectedFields = sectionFields.get(targetSection.id) ?? new Set<string>()
          stats.protectedFields += sourceFieldConflicts(targetSection, { name: section.name, mediaId: sectionMediaId, sortOrder: section.sortOrder, branchScope: scope.branchScope }, protectedFields, 'section', targetSection.id).length
          const effectiveName = protectedFields.has('name') ? targetSection.name : section.name
          const effectiveMediaId = protectedFields.has('mediaId') ? targetSection.mediaId : sectionMediaId
          const effectiveScope = protectedFields.has('branchScope') ? { branchScope: targetSection.branchScope, branchLabel: targetSection.branchLabel } : scope
          const effectiveSortOrder = protectedFields.has('sortOrder') ? targetSection.sortOrder : section.sortOrder
          if (targetSection.sourceName !== section.name || targetSection.name !== effectiveName || targetSection.description !== section.description
            || targetSection.mediaId !== effectiveMediaId || targetSection.facetId !== matchFacet(effectiveName)
            || targetSection.branchScope !== effectiveScope.branchScope || targetSection.branchLabel !== effectiveScope.branchLabel
            || targetSection.sortOrder !== effectiveSortOrder) {
            await tx.update(menuSectionTable).set({ sourceName: section.name, name: effectiveName, description: section.description, mediaId: effectiveMediaId, facetId: matchFacet(effectiveName), ...effectiveScope, sortOrder: effectiveSortOrder }).where(eq(menuSectionTable.id, targetSection.id))
          }
        }

        const inserts: (typeof menuItemTable.$inferInsert)[] = []
        for (const [itemIndex, sourceItem] of section.items.entries()) {
          const sourceItemId = Number(sourceItem['شناسه'])
          sourceItemIds.add(sourceItemId)
          const values = itemValues(sourceItem, context)
          const mediaId = mediaIdFor(sourceItem['تصویر'])
          const existing = itemBySource.get(sourceItemId)
          if (!existing) {
            const dishSlug = matchDish(values.name, facetId, { price: values.price, sectionName: section.name })
            const dishId = dishSlug ? dishBySlug.get(dishSlug) ?? null : null
            inserts.push({ publicId: importedItemPublicId(sourceItemId, cafeSourceId, section.sortOrder, itemIndex), placeId, sectionId: targetSection.id, sourceId: sourceItemId, ...values, mediaId, dishId, sortOrder: itemIndex, archivedAt: null, priceUpdatedAt: values.price === null ? null : appliedAt })
            continue
          }
          if (existing.placeId !== placeId) { stats.skipped++; continue }
          const effective = mergeItemSource(existing, { ...existing, ...values, sectionId: targetSection.id, mediaId, sortOrder: itemIndex, archivedAt: null }, itemFields.get(existing.id) ?? new Set())
          stats.protectedFields += sourceFieldConflicts(existing, { ...existing, ...values, sectionId: targetSection.id, mediaId, sortOrder: itemIndex, archivedAt: null }, itemFields.get(existing.id) ?? new Set(), 'item', existing.id).length
          const effectiveSection = sections.find(row => row.id === effective.sectionId) ?? targetSection
          const effectiveName = effectiveSection.id === targetSection.id ? (sectionFields.get(targetSection.id)?.has('name') ? targetSection.name : section.name) : effectiveSection.name
          const effectiveFacet = matchFacet(effectiveName)
          const dishSlug = matchDish(effective.name, effectiveFacet, { price: effective.price, sectionName: effectiveName })
          const dishId = dishSlug ? dishBySlug.get(dishSlug) ?? null : null
          const moved = existing.sectionId !== effective.sectionId
          const reactivated = existing.archivedAt !== null && effective.archivedAt === null
          const changed = moved || reactivated || existing.name !== effective.name || existing.nameEn !== effective.nameEn
            || existing.description !== effective.description || existing.price !== effective.price
            || existing.priceUnknown !== effective.priceUnknown || existing.available !== effective.available
            || existing.featured !== effective.featured || existing.mediaId !== effective.mediaId
            || existing.dishId !== dishId || existing.sortOrder !== effective.sortOrder
          if (!changed) continue
          await tx.update(menuItemTable).set({ sectionId: effective.sectionId, name: effective.name, nameEn: effective.nameEn, nameNormalized: normalizeFa(effective.name), description: effective.description, price: effective.price, priceUnknown: effective.priceUnknown, available: effective.available, featured: effective.featured, mediaId: effective.mediaId, dishId, sortOrder: effective.sortOrder, archivedAt: effective.archivedAt, priceUpdatedAt: existing.price !== effective.price ? (effective.price === null ? null : appliedAt) : existing.priceUpdatedAt }).where(eq(menuItemTable.id, existing.id))
          stats.updatedItems++
          if (moved) stats.movedItems++
          if (reactivated) stats.reactivatedItems++
        }
        for (let index = 0; index < inserts.length; index += CHUNK) await tx.insert(menuItemTable).values(inserts.slice(index, index + CHUNK))
        stats.insertedItems += inserts.length
      }

      // source_id خالی یعنی آیتم دستی کافه‌دار و هرگز با sync آرشیو نمی‌شود.
      if (sourceItemIds.size > 0) {
        const archiveIds = (itemsByPlace.get(placeId) ?? []).filter((item) => item.sourceId !== null && !sourceItemIds.has(item.sourceId) && item.archivedAt === null && !itemFields.get(item.id)?.has('archivedAt')).map((item) => item.id)
        stats.protectedFields += (itemsByPlace.get(placeId) ?? []).filter((item) => item.sourceId !== null && !sourceItemIds.has(item.sourceId) && item.archivedAt === null && itemFields.get(item.id)?.has('archivedAt')).length
        for (let index = 0; index < archiveIds.length; index += CHUNK) {
          await tx.update(menuItemTable).set({ archivedAt: appliedAt }).where(inArray(menuItemTable.id, archiveIds.slice(index, index + CHUNK)))
        }
        stats.archivedItems += archiveIds.length
      }
    }

    // گارد اتمیک کامل‌بودن: پیش از COMMIT، خود snapshot را دوباره از دیتابیس
    // می‌خوانیم. هر مغایرت باعث throw و rollback کل عملیات می‌شود.
    const [verifiedPlaces, verifiedSections, verifiedItems] = await Promise.all([
      tx.select({ id: placeTable.id, sourceId: placeTable.sourceId, priceUnitFixed: placeTable.priceUnitFixed }).from(placeTable).where(isNotNull(placeTable.sourceId)),
      tx.select({ id: menuSectionTable.id, placeId: menuSectionTable.placeId, name: menuSectionTable.name, sourceName: menuSectionTable.sourceName }).from(menuSectionTable),
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
    const verifiedSectionByPlaceAndName = new Map(verifiedSections.map((row) => [`${row.placeId}|${normalizeFa(row.sourceName ?? row.name)}`, row]))
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
          const previous = itemBySource.get(sourceItemId)
          const effective = previous && verifiedSection
            ? mergeItemSource(previous, { ...previous, ...expected, sectionId: verifiedSection.id, archivedAt: null }, itemFields.get(previous.id) ?? new Set())
            : null
          if (!actual) verificationErrors.push(`آیتم ${sourceItemId} درج نشده`)
          else if (actual.placeId !== verifiedPlace.id) verificationErrors.push(`آیتم ${sourceItemId} به مجموعهٔ اشتباه متصل است`)
          else if (actual.archivedAt !== null && !itemFields.get(previous?.id ?? -1)?.has('archivedAt')) verificationErrors.push(`آیتم ${sourceItemId} به‌اشتباه آرشیو است`)
          else if (verifiedSection && actual.sectionId !== (effective?.sectionId ?? verifiedSection.id)) verificationErrors.push(`دستهٔ آیتم ${sourceItemId} درست نیست`)
          else if (actual.name !== (effective ? effective.name : expected.name) || actual.price !== (effective ? effective.price : expected.price) || actual.available !== (effective ? effective.available : expected.available)) verificationErrors.push(`محتوای مؤثر آیتم ${sourceItemId} نادرست است`)
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
    // The audit record must commit with the snapshot. Post-commit media or
    // facet work can fail; that must not leave an applied sync without audit.
    await tx.insert(auditLog).values({
      actorUserId: current.actorUserId ?? null,
      actorLabel: current.actorLabel ?? 'admin',
      action: 'topmenu.full_sync',
      entity: 'topmenu_sync',
      entityId: runId,
      before: { proposed: selectedReport.totalChanges, newCafes: selectedReport.totalNewCafes, newItems: selectedReport.totalNewItems, protectedPreview: selectedReport.protectedCount ?? 0, selection },
      after: { ...stats, affectedCafes: affected.size, sourceIds: cafes.map(cafe => cafe['شناسه']), backup },
    })
  })

  for (const placeId of affected) await refreshPlaceDerived(placeId)
  if (process.env.TOPMENU_SYNC_SMOKE_TEST !== '1') {
    await runNodeScript('scripts/build-facets.ts', [], join(runDir, 'reindex.log'))
    await runNodeScript('scripts/media-download.ts', [], join(runDir, 'media-download.log'))
  }

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
