import type { ExperienceDefinition } from './registry'

export interface ExperienceSignal {
  attributeId: string
  value: number
  confidence: number
  source: string
  verifiedAt: Date | null
}

export interface ExperienceRank {
  primaryValue: number
  supportValue: number
  confidence: number
  sourceWeight: number
  freshness: number
}

const SOURCE_WEIGHT: Record<string, number> = {
  field_visit: 6,
  editorial: 5,
  owner: 4,
  instagram: 3,
  user: 2,
  inferred: 1,
  import: 0,
}

/** رتبهٔ داخلی و شفاف؛ عدد آن هرگز به‌عنوان AI Score به کاربر نشان داده نمی‌شود. */
export function experienceRank(
  experience: ExperienceDefinition,
  signals: readonly ExperienceSignal[],
): ExperienceRank {
  const positive = signals.filter((signal) => signal.value >= 1)
  const primary = positive.find((signal) => signal.attributeId === experience.primaryAttributeId)
  const supporting = positive.filter((signal) =>
    experience.supportingAttributeIds.includes(signal.attributeId),
  )
  const confidence = positive.length > 0
    ? Math.round(positive.reduce((sum, signal) => sum + signal.confidence, 0) / positive.length)
    : 0
  const newest = positive.reduce(
    (latest, signal) => Math.max(latest, signal.verifiedAt?.getTime() ?? 0),
    0,
  )

  return {
    primaryValue: primary?.value ?? 0,
    supportValue: supporting.reduce((sum, signal) => sum + signal.value, 0),
    confidence,
    sourceWeight: SOURCE_WEIGHT[primary?.source ?? ''] ?? 0,
    freshness: newest,
  }
}

export function compareExperienceRank(a: ExperienceRank, b: ExperienceRank): number {
  return (
    b.primaryValue - a.primaryValue ||
    b.supportValue - a.supportValue ||
    b.confidence - a.confidence ||
    b.sourceWeight - a.sourceWeight ||
    b.freshness - a.freshness
  )
}
