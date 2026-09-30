import { squashFa } from '@/core/text/normalize'

export interface FuzzyCandidate<T> {
  value: T
  terms: string[]
}

export interface FuzzyMatch<T> {
  value: T
  distance: number
}

/** Levenshtein با حافظهٔ خطی؛ فقط روی واژه‌های کوتاه و پس از صفرنتیجه اجرا می‌شود. */
export function editDistance(left: string, right: string): number {
  if (left === right) return 0
  if (!left) return right.length
  if (!right) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[right.length] ?? Number.POSITIVE_INFINITY
}

/**
 * فقط یک برندهٔ روشن با حداکثر یک/دو اشتباه را می‌پذیرد. تساوی رد می‌شود تا
 * سیستم به‌جای کاربر حدس خطرناک نزند.
 */
export function closestFuzzy<T>(query: string, candidates: FuzzyCandidate<T>[]): T | null {
  const matches = fuzzyMatches(query, candidates)
  if (matches.length === 0) return null
  const bestDistance = matches[0]!.distance
  const best = matches.filter((match) => match.distance === bestDistance)
  return best.length === 1 ? best[0]!.value : null
}

/** همهٔ تطابق‌های محافظه‌کارانه، با کمترین فاصلهٔ هر کاندیدا. */
export function fuzzyMatches<T>(query: string, candidates: FuzzyCandidate<T>[]): FuzzyMatch<T>[] {
  const normalized = squashFa(query)
  if (normalized.length < 4 || normalized.length > 32) return []
  const allowed = normalized.length <= 5 ? 1 : 2
  const matches: FuzzyMatch<T>[] = []

  for (const candidate of candidates) {
    let bestDistance = Number.POSITIVE_INFINITY
    for (const term of candidate.terms) {
      const normalizedTerm = squashFa(term)
      if (!normalizedTerm || Math.abs(normalizedTerm.length - normalized.length) > allowed) continue
      const distance = editDistance(normalized, normalizedTerm)
      if (distance > allowed) continue
      bestDistance = Math.min(bestDistance, distance)
    }
    if (Number.isFinite(bestDistance)) matches.push({ value: candidate.value, distance: bestDistance })
  }
  return matches.sort((a, b) => a.distance - b.distance)
}
