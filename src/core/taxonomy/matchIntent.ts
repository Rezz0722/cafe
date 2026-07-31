/**
 * تبدیل متن آزاد کاربر به شناسه‌ی ویژگی.
 *
 * ═══ جایگزین باگ پیشوند شش‌کاراکتری ═══
 *
 * الگوریتم قبلی: `INTENTS.filter(t => query.includes(t.slice(0, 6)))`
 * سه نیت پیشوند «مناسب » داشتند، پس هر سه با هم روشن می‌شدند و چون فیلتر
 * AND بود، نتیجه صفر می‌شد.
 *
 * الگوریتم اینجا:
 *   ۱. همه‌ی عبارت‌ها (برچسب + مترادف‌ها) در یک فهرست جمع می‌شوند
 *   ۲. از بلندترین به کوتاه‌ترین مرتب می‌شوند
 *   ۳. هر عبارتی که تطابق داد، از رشته‌ی جست‌وجو *حذف* می‌شود
 *
 * قدم ۳ همان چیزی است که برخورد را غیرممکن می‌کند: وقتی «مناسب کار با لپ‌تاپ»
 * تطابق داد و مصرف شد، دیگر «کار» روی باقی‌مانده تطابق نمی‌دهد. و چون تطابق
 * روی مرزِ واژه انجام می‌شود، «قرارداد» به‌اشتباه «قرار» را روشن نمی‌کند.
 */

import { ATTRIBUTES } from './attributes'
import { finglishToFa, isLatin, normalizeFa } from '@/core/text/normalize'

interface Phrase {
  attributeId: string
  normalized: string
  /** تعداد واژه — برای مرتب‌سازی «بلندترین اول». */
  wordCount: number
}

/** فهرست تخت همه‌ی عبارت‌های قابل تطابق، بلندترین اول. */
const PHRASES: Phrase[] = ATTRIBUTES.flatMap((attr) =>
  [attr.labelFa, ...attr.synonyms].map((raw) => {
    const normalized = normalizeFa(raw)
    return {
      attributeId: attr.id,
      normalized,
      wordCount: normalized.split(' ').filter(Boolean).length,
    }
  }),
)
  .filter((p) => p.normalized.length > 1)
  .sort((a, b) => b.normalized.length - a.normalized.length)

/** تطابق روی مرز واژه، تا «قرارداد» عبارتِ «قرار» را روشن نکند. */
function matchesAtWordBoundary(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle)
  if (idx === -1) return false

  const before = idx === 0 ? ' ' : haystack[idx - 1]
  const afterIdx = idx + needle.length
  const after = afterIdx >= haystack.length ? ' ' : haystack[afterIdx]

  return before === ' ' && after === ' '
}

export interface IntentMatch {
  attributeIds: string[]
  /** بخشی از query که به هیچ ویژگی نگاشت نشد — برای جست‌وجوی متنی روی نام. */
  residual: string
}

/**
 * نیت‌های موجود در یک عبارت جست‌وجو را استخراج می‌کند.
 *
 * اگر ورودی لاتین باشد (فینگلیش) هم نسخه‌ی اصلی و هم نسخه‌ی ترانویسی‌شده
 * امتحان می‌شوند، چون «cafe kar» باید همان «کار» را پیدا کند.
 */
export function matchIntents(query: string): IntentMatch {
  if (!query?.trim()) return { attributeIds: [], residual: '' }

  const candidates = [normalizeFa(query)]
  if (isLatin(query)) candidates.push(normalizeFa(finglishToFa(query)))

  const found = new Set<string>()
  let residual = candidates[0]

  for (const candidate of candidates) {
    // با فاصله در دو طرف کار می‌کنیم تا بررسی مرز واژه ساده بماند.
    let working = ` ${candidate} `

    for (const phrase of PHRASES) {
      if (found.has(phrase.attributeId)) continue

      const needle = ` ${phrase.normalized} `
      if (matchesAtWordBoundary(working, phrase.normalized) || working.includes(needle)) {
        found.add(phrase.attributeId)
        // مصرفِ عبارت — همین خط جلوی برخورد «مناسب » را می‌گیرد.
        working = working.replace(needle, ' ')
      }
    }

    if (candidate === candidates[0]) residual = working.trim()
  }

  return {
    attributeIds: [...found],
    residual: residual.replace(/\s+/g, ' ').trim(),
  }
}
