import { normalizeFa } from '@/core/text/normalize'

/**
 * نام دسته‌های ایمپورت‌شده گاهی نام شعبه را هم در پرانتز دارند. Scope شعبه
 * در دیتابیس حل شده؛ تکرار همان نام در Taxonomy فقط ناوبری منو را شلوغ می‌کند.
 */
export function presentMenuSectionName(name: string, branchName?: string | null): string {
  const branch = normalizeFa(branchName ?? '').replace(/^شعبه\s+/, '').trim()
  let value = name.trim()

  value = value.replace(/\(([^)]*)\)/g, (whole, inside: string) => {
    const normalized = normalizeFa(inside).replace(/^شعبه\s+/, '').trim()
    if (normalized.startsWith('شعبه ')) return ''
    if (branch && (normalized.includes(branch) || branch.includes(normalized))) return ''
    return whole
  })

  return value
    .replace(/\bExtera\b/gi, 'Extras')
    .replace(/شام\s+و\s+نهار/g, 'شام و ناهار')
    .replace(/([\u0600-\u06ff])\s+های(?=\s|$)/g, '$1‌های')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** نام کامل در داده می‌ماند، اما در Hero برند و شعبه دو سطح جدا دارند. */
export function placeIdentity(input: {
  name: string
  brandName?: string | null
  branchName?: string | null
}): { title: string; branchLabel: string | null } {
  const title = input.brandName?.trim() || input.name.trim()
  const branch = input.branchName?.trim()
  return {
    title,
    branchLabel: branch ? `شعبهٔ ${branch}` : null,
  }
}

/** نام کامل خانوادگی روی صفحهٔ عمومی لازم نیست و حریم خصوصی را کم می‌کند. */
export function publicReviewerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'کاربر کو کافه'
  if (parts.length === 1) return parts[0]!
  return `${parts[0]} ${parts.at(-1)!.slice(0, 1)}.`
}

export function ageInDays(date: Date | null, now = new Date()): number | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
}
