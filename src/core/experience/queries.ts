import 'server-only'

import { and, eq, gte, inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { place as placeTable, placeAttribute as placeAttributeTable } from '@/db/schema'
import { ATTRIBUTE_BY_ID } from '@/core/taxonomy/attributes'
import { FACET_BY_ID } from '@/core/taxonomy/menuTaxonomy'
import {
  listAttributeCounts,
  listPlaceCards,
  type PlaceCard,
} from '@/core/places/queries'
import {
  EXPERIENCES,
  type ExperienceDefinition,
  type ExperienceSlug,
} from './registry'
import {
  compareExperienceRank,
  experienceRank,
  type ExperienceRank,
  type ExperienceSignal,
} from './ranking'

export interface ExperienceSummary {
  experience: ExperienceDefinition
  candidateCount: number
  indexable: boolean
}

export interface ExperienceCandidate {
  card: PlaceCard
  reasons: string[]
  rank: ExperienceRank
  source: string | null
  verifiedAt: Date | null
}

export async function listExperienceSummaries(): Promise<ExperienceSummary[]> {
  const counts = await listAttributeCounts()
  return EXPERIENCES.map((experience) => {
    const candidateCount = counts[experience.primaryAttributeId] ?? 0
    return {
      experience,
      candidateCount,
      indexable: candidateCount >= experience.minIndexCandidates,
    }
  })
}

export async function listExperienceCandidates(
  experience: ExperienceDefinition,
  limit = 60,
  offset = 0,
): Promise<{ candidates: ExperienceCandidate[]; total: number }> {
  // Rank lightweight eligible IDs with the existing ranking contract BEFORE
  // taking a page. Ranking a quality-limited window loses candidates and makes
  // page boundaries unstable. Only the selected page hydrates full cards/facets.
  const eligible = await getDb().select({ id: placeTable.id, qualityScore: placeTable.qualityScore })
    .from(placeTable)
    .innerJoin(placeAttributeTable, and(eq(placeAttributeTable.placeId, placeTable.id),
      eq(placeAttributeTable.attributeId, experience.primaryAttributeId), gte(placeAttributeTable.value, 1)))
    .where(eq(placeTable.status, 'published'))
  const total = eligible.length
  if (total === 0) return { candidates: [], total }

  const relevantAttributeIds = [
    experience.primaryAttributeId,
    ...experience.supportingAttributeIds,
  ]
  const rows = await getDb()
    .select({
      placeId: placeAttributeTable.placeId,
      attributeId: placeAttributeTable.attributeId,
      value: placeAttributeTable.value,
      confidence: placeAttributeTable.confidence,
      source: placeAttributeTable.source,
      verifiedAt: placeAttributeTable.verifiedAt,
    })
    .from(placeAttributeTable)
    .where(and(
      inArray(placeAttributeTable.placeId, eligible.map((row) => row.id)),
      inArray(placeAttributeTable.attributeId, relevantAttributeIds),
    ))

  const signalsByPlace = new Map<number, ExperienceSignal[]>()
  for (const row of rows) {
    const list = signalsByPlace.get(row.placeId) ?? []
    list.push(row)
    signalsByPlace.set(row.placeId, list)
  }

  const ranked = eligible.map(row => ({ ...row, rank: experienceRank(experience, signalsByPlace.get(row.id) ?? []) }))
    .sort((a, b) => compareExperienceRank(a.rank, b.rank) || b.qualityScore - a.qualityScore || a.id - b.id)
  const safeOffset = Number.isSafeInteger(offset) && offset > 0 ? offset : 0
  const safeLimit = Number.isSafeInteger(limit) ? Math.max(1, Math.min(200, limit)) : 60
  const selected = ranked.slice(safeOffset, safeOffset + safeLimit)
  if (!selected.length) return { candidates: [], total }
  const cards = await listPlaceCards({ placeIds: selected.map(row => row.id), limit: selected.length, sort: 'quality' })
  const cardById = new Map(cards.map(card => [card.id, card]))
  const candidates = selected.flatMap(({ id }): ExperienceCandidate[] => {
    const card = cardById.get(id)
    if (!card) return [] // A concurrently unpublished venue must fail closed.
    const signals = signalsByPlace.get(card.id) ?? []
    const primary = signals.find((signal) => signal.attributeId === experience.primaryAttributeId)
    const positiveSignals = signals
      .filter((signal) => signal.value >= 1)
      .sort((a, b) => {
        if (a.attributeId === experience.primaryAttributeId) return -1
        if (b.attributeId === experience.primaryAttributeId) return 1
        return b.value - a.value || b.confidence - a.confidence
      })
    const reasons = positiveSignals
      .map((signal) => ATTRIBUTE_BY_ID.get(signal.attributeId)?.labelFa)
      .filter((label): label is string => Boolean(label))

    for (const facetId of experience.supportingFacetIds ?? []) {
      if (card.facetIds.includes(facetId)) {
        const label = FACET_BY_ID.get(facetId)?.labelFa
        if (label) reasons.push(`${label} در منو`)
      }
    }

    return [{
      card,
      reasons: [...new Set(reasons)].slice(0, 3),
      rank: experienceRank(experience, signals),
      source: primary?.source ?? null,
      verifiedAt: primary?.verifiedAt ?? null,
    }]
  })

  return { candidates, total }
}

export async function experienceCount(slug: ExperienceSlug): Promise<number> {
  const summary = (await listExperienceSummaries()).find((item) => item.experience.slug === slug)
  return summary?.candidateCount ?? 0
}
