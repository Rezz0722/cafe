import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { placeAttribute as placeAttributeTable } from '@/db/schema'
import { ATTRIBUTE_BY_ID } from '@/core/taxonomy/attributes'
import { FACET_BY_ID } from '@/core/taxonomy/menuTaxonomy'
import {
  countPlaces,
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
): Promise<{ candidates: ExperienceCandidate[]; total: number }> {
  const [cards, total] = await Promise.all([
    listPlaceCards({
      attributeIds: [experience.primaryAttributeId],
      limit,
      sort: 'quality',
    }),
    countPlaces({ attributeIds: [experience.primaryAttributeId] }),
  ])
  if (cards.length === 0) return { candidates: [], total }

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
      inArray(placeAttributeTable.placeId, cards.map((card) => card.id)),
      inArray(placeAttributeTable.attributeId, relevantAttributeIds),
    ))

  const signalsByPlace = new Map<number, ExperienceSignal[]>()
  for (const row of rows) {
    const list = signalsByPlace.get(row.placeId) ?? []
    list.push(row)
    signalsByPlace.set(row.placeId, list)
  }

  const candidates = cards.map((card): ExperienceCandidate => {
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

    return {
      card,
      reasons: [...new Set(reasons)].slice(0, 3),
      rank: experienceRank(experience, signals),
      source: primary?.source ?? null,
      verifiedAt: primary?.verifiedAt ?? null,
    }
  })

  candidates.sort((a, b) =>
    compareExperienceRank(a.rank, b.rank) ||
    b.card.qualityScore - a.card.qualityScore ||
    a.card.id - b.card.id,
  )

  return { candidates, total }
}

export async function experienceCount(slug: ExperienceSlug): Promise<number> {
  const summary = (await listExperienceSummaries()).find((item) => item.experience.slug === slug)
  return summary?.candidateCount ?? 0
}
