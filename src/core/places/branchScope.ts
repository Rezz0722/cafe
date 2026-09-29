import { normalizeFa } from '@/core/text/normalize'

export type MenuBranchScope = 'shared' | 'branch' | 'other_branch' | 'unverified'

export interface MenuBranchDecision {
  branchScope: MenuBranchScope
  branchLabel: string | null
}

const BRANCH_MARKER = /شعب(?:ه|ات)|انحصاری\s*شعبه/u

/**
 * منبع بعضی برندها یک catalog برای چند شعبه می‌دهد و نام شعبه را داخل عنوان
 * دسته می‌نویسد. تا وقتی منبع شناسهٔ شعبه نمی‌دهد، این classifier مانع نشت
 * دستهٔ صریحاً متعلق به شعبهٔ دیگر به صفحهٔ شعبهٔ فعلی می‌شود.
 */
export function classifyMenuBranchScope(
  sectionName: string,
  branchName: string | null | undefined,
): MenuBranchDecision {
  const section = normalizeFa(sectionName)
  const branch = normalizeFa(branchName ?? '')
  if (!branch) return { branchScope: 'shared', branchLabel: null }
  const identifyingWords = branch.split(/\s+/).filter((word) => word.length >= 4)
  const matchesCurrent = identifyingWords.some((word) => section.includes(word.slice(0, 5)))
  if (matchesCurrent) return { branchScope: 'branch', branchLabel: branchName!.trim() }
  if (!BRANCH_MARKER.test(section)) return { branchScope: 'shared', branchLabel: null }

  // عنوان شعبه‌دار است ولی شعبهٔ فعلی در آن نیست؛ داده حفظ می‌شود و فقط از
  // خروجی عمومی این شعبه کنار می‌رود تا ادمین آن را به شعبهٔ درست منتقل کند.
  return { branchScope: 'other_branch', branchLabel: sectionName.trim().slice(0, 200) }
}
