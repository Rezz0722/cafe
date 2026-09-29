import 'server-only'

import { asc, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import {
  district as districtTable,
  place as placeTable,
  placeAttribute as placeAttributeTable,
} from '@/db/schema'
import { normalizeFa } from '@/core/text/normalize'
import {
  EXPERIENCES,
  EXPERIENCE_CURATION_ATTRIBUTE_IDS,
  EXPERIENCE_PRIMARY_ATTRIBUTE_IDS,
} from './registry'

export type ExperienceCoverageFilter = 'all' | 'unreviewed' | 'partial' | 'reviewed' | 'stale'

export interface CurationAttributeValue {
  value: number
  confidence: number
  source: string
  verifiedAt: Date | null
}

export interface CurationPlace {
  id: number
  slug: string
  name: string
  address: string
  districtId: string | null
  districtName: string | null
  qualityScore: number
  revision: number
  attributes: Record<string, CurationAttributeValue>
  answeredPrimary: number
  coverage: 'unreviewed' | 'partial' | 'reviewed' | 'stale'
}

export interface ExperienceCoverageDashboard {
  totalPublished: number
  reviewedPlaces: number
  partialPlaces: number
  unreviewedPlaces: number
  stalePlaces: number
  progress: {
    slug: string
    title: string
    answered: number
    positive: number
  }[]
  districts: { id: string; name: string }[]
  matches: number
  queue: CurationPlace[]
  selected: CurationPlace | null
  previousPlaceId: number | null
  nextPlaceId: number | null
}

const STALE_AFTER_MS = 180 * 24 * 60 * 60 * 1000

function coverageOf(place: Omit<CurationPlace, 'coverage'>, now: number): CurationPlace['coverage'] {
  const primary = EXPERIENCE_PRIMARY_ATTRIBUTE_IDS
    .map((id) => place.attributes[id])
    .filter((value): value is CurationAttributeValue => Boolean(value))
  if (primary.length === 0) return 'unreviewed'
  if (primary.length < EXPERIENCE_PRIMARY_ATTRIBUTE_IDS.length) return 'partial'
  if (primary.some((item) => !item.verifiedAt || now - item.verifiedAt.getTime() > STALE_AFTER_MS)) {
    return 'stale'
  }
  return 'reviewed'
}

export async function getExperienceCoverageDashboard(input: {
  placeId?: number | null
  status?: ExperienceCoverageFilter
  districtId?: string
  query?: string
} = {}): Promise<ExperienceCoverageDashboard> {
  const db = getDb()
  const [places, districts] = await Promise.all([
    db
      .select({
        id: placeTable.id,
        slug: placeTable.slug,
        name: placeTable.name,
        nameNormalized: placeTable.nameNormalized,
        address: placeTable.address,
        districtId: placeTable.districtId,
        districtName: districtTable.name,
        qualityScore: placeTable.qualityScore,
        revision: placeTable.revision,
      })
      .from(placeTable)
      .leftJoin(districtTable, eq(districtTable.id, placeTable.districtId))
      .where(eq(placeTable.status, 'published'))
      .orderBy(asc(placeTable.id)),
    db
      .select({ id: districtTable.id, name: districtTable.name })
      .from(districtTable)
      .orderBy(asc(districtTable.sortOrder), asc(districtTable.name)),
  ])

  const attributeRows = places.length > 0
    ? await db
        .select({
          placeId: placeAttributeTable.placeId,
          attributeId: placeAttributeTable.attributeId,
          value: placeAttributeTable.value,
          confidence: placeAttributeTable.confidence,
          source: placeAttributeTable.source,
          verifiedAt: placeAttributeTable.verifiedAt,
        })
        .from(placeAttributeTable)
        .where(inArray(placeAttributeTable.attributeId, EXPERIENCE_CURATION_ATTRIBUTE_IDS))
    : []

  const attributes = new Map<number, Record<string, CurationAttributeValue>>()
  for (const row of attributeRows) {
    const current = attributes.get(row.placeId) ?? {}
    current[row.attributeId] = {
      value: row.value,
      confidence: row.confidence,
      source: row.source,
      verifiedAt: row.verifiedAt,
    }
    attributes.set(row.placeId, current)
  }

  const now = Date.now()
  const hydrated: CurationPlace[] = places.map((row) => {
    const placeAttributes = attributes.get(row.id) ?? {}
    const base = {
      id: row.id,
      slug: row.slug,
      name: row.name,
      address: row.address,
      districtId: row.districtId,
      districtName: row.districtName,
      qualityScore: row.qualityScore,
      revision: row.revision,
      attributes: placeAttributes,
      answeredPrimary: EXPERIENCE_PRIMARY_ATTRIBUTE_IDS.filter((id) => placeAttributes[id]).length,
    }
    return { ...base, coverage: coverageOf(base, now) }
  })

  const status = input.status ?? 'all'
  const query = normalizeFa(input.query ?? '')
  const filtered = hydrated.filter((place) => {
    if (status !== 'all' && place.coverage !== status) return false
    if (input.districtId && place.districtId !== input.districtId) return false
    if (query) {
      const haystack = normalizeFa(`${place.name} ${place.address} ${place.districtName ?? ''}`)
      if (!haystack.includes(query)) return false
    }
    return true
  })
  filtered.sort((a, b) =>
    a.answeredPrimary - b.answeredPrimary ||
    b.qualityScore - a.qualityScore ||
    a.id - b.id,
  )

  const selectedIndex = Math.max(0, filtered.findIndex((place) => place.id === input.placeId))
  const selected = filtered[selectedIndex] ?? null
  const progress = EXPERIENCES.map((experience) => ({
    slug: experience.slug,
    title: experience.shortTitle,
    answered: hydrated.filter((place) => place.attributes[experience.primaryAttributeId]).length,
    positive: hydrated.filter((place) => (place.attributes[experience.primaryAttributeId]?.value ?? 0) >= 1).length,
  }))

  return {
    totalPublished: hydrated.length,
    reviewedPlaces: hydrated.filter((place) => place.coverage === 'reviewed').length,
    partialPlaces: hydrated.filter((place) => place.coverage === 'partial').length,
    unreviewedPlaces: hydrated.filter((place) => place.coverage === 'unreviewed').length,
    stalePlaces: hydrated.filter((place) => place.coverage === 'stale').length,
    progress,
    districts,
    matches: filtered.length,
    queue: filtered.slice(0, 30),
    selected,
    previousPlaceId: selectedIndex > 0 ? filtered[selectedIndex - 1]!.id : null,
    nextPlaceId: selectedIndex >= 0 && selectedIndex < filtered.length - 1
      ? filtered[selectedIndex + 1]!.id
      : null,
  }
}
