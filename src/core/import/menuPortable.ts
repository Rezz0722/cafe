import { cleanUserText } from '@/core/security/input'
import { normalizeFa, toAsciiDigits } from '@/core/text/normalize'

export const MAX_PORTABLE_BYTES = 512 * 1024
export const MAX_PORTABLE_ITEMS = 500
export const MAX_PORTABLE_APPLY = 20
export type PortableVariant = { label: string; price: number | null; available: boolean }
export type PortableItem = {
  section: string; name: string; description: string | null; price: number | null;
  available: boolean; featured: boolean; archived: boolean; variants: PortableVariant[];
  excludeFromPriceStats: boolean; publicId: string | null; imageReference: string | null
}
export type PortableFormat = 'json' | 'csv'
export interface PortableMenu { format: PortableFormat; items: PortableItem[]; ignoredImageCount: number; ignoredMetadata: string[] }

const CSV_HEADERS = ['نام دسته', 'نام آیتم', 'توضیح', 'قیمت (تومان)', 'نام سایز', 'قیمت سایز (تومان)', 'موجودی', 'وضعیت آرشیو', 'لینک تصویر']
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ساختار فایل JSON معتبر نیست.')
  return value as Record<string, unknown>
}
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('فهرست دسته‌ها، آیتم‌ها یا سایزها معتبر نیست.')
  return value
}
const boolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') throw new Error('وضعیت موجودی، ویژه یا آرشیو معتبر نیست.')
  return value
}
const text = (value: unknown, max: number, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} باید متن باشد.`)
  const cleaned = cleanUserText(value, max + 1)
  if (cleaned.length < 1 || cleaned.length > max) throw new Error(`${label} طول معتبر ندارد.`)
  return cleaned
}
const optionalText = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined || value === '') return null
  return text(value, max, 'متن')
}
const imageReference = (value: unknown): string | null => {
  const candidate = optionalText(value, 500)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString()
  } catch { /* handled below */ }
  throw new Error('لینک تصویر باید URL معتبر HTTP(S) باشد؛ تصویر خودکار منتقل نمی‌شود.')
}
const price = (value: unknown): number | null => {
  if (value === null) return null
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2147483647) throw new Error('قیمت باید عدد صحیح تومان یا نامعلوم باشد.')
  return value as number
}

function rejectDangerousKeys(root: unknown) {
  const stack: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }]
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (depth > 12) throw new Error('عمق ساختار فایل بیش از حد مجاز است.')
    if (!value || typeof value !== 'object') continue
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new Error('کلید ناامن در فایل JSON وجود دارد.')
      stack.push({ value: child, depth: depth + 1 })
    }
  }
}

function assertUnique(items: PortableItem[]) {
  const sections = new Map<string, string>(), names = new Set<string>(), publicIds = new Set<string>()
  for (const item of items) {
    const section = normalizeFa(item.section), key = `${section}\u0000${normalizeFa(item.name)}`
    if (sections.has(section) && sections.get(section) !== item.section) throw new Error('نام دو دسته پس از یکسان‌سازی فارسی تکراری است.')
    sections.set(section, item.section)
    if (names.has(key)) throw new Error('نام آیتم در یک دسته تکراری یا مبهم است.')
    names.add(key)
    if (item.publicId) {
      if (publicIds.has(item.publicId)) throw new Error('شناسهٔ عمومی تکراری در فایل وجود دارد.')
      publicIds.add(item.publicId)
    }
    if (item.variants.length) {
      const labels = new Set<string>()
      for (const variant of item.variants) {
        const label = normalizeFa(variant.label)
        if (labels.has(label)) throw new Error('نام سایز در یک آیتم تکراری است.')
        labels.add(label)
      }
      const availablePrices = item.variants.filter(variant => variant.available && variant.price !== null).map(variant => variant.price!)
      const expected = availablePrices.length ? Math.min(...availablePrices) : null
      if (item.price !== expected) throw new Error('قیمت پایهٔ آیتم چندسایزی با کمترین سایز موجود سازگار نیست.')
    }
  }
}

function parseJson(raw: string): PortableMenu {
  let decoded: unknown
  try { decoded = JSON.parse(raw) } catch { throw new Error('فایل JSON خراب است.') }
  rejectDangerousKeys(decoded)
  const root = object(decoded)
  if (root.format !== 'kucafe-menu' || root.version !== 1) throw new Error('فقط خروجی JSON نسخهٔ ۱ کو کافه پشتیبانی می‌شود.')
  if (root.priceUnit !== 'toman') throw new Error('واحد قیمت باید تومان باشد.')
  object(root.place)
  const items: PortableItem[] = []
  let ignoredImageCount = 0
  const sections = array(root.sections)
  if (sections.length > MAX_PORTABLE_ITEMS) throw new Error('تعداد دسته‌ها بیش از حد مجاز است.')
  for (const sectionValue of sections) {
    const section = object(sectionValue), sectionName = text(section.name, 200, 'نام دسته')
    if (sectionName.length < 2) throw new Error('نام دسته باید حداقل دو نویسه داشته باشد.')
    if (!['shared', 'branch'].includes(String(section.scope))) throw new Error('دامنهٔ دستهٔ فایل مجاز نیست.')
    if (section.imageUrl) ignoredImageCount++
    for (const itemValue of array(section.items)) {
      const item = object(itemValue), itemPrice = price(item.price), unknown = boolean(item.priceUnknown)
      if (unknown !== (itemPrice === null)) throw new Error('قیمت نامعلوم با مقدار قیمت ناسازگار است.')
      const variants = array(item.variants).map(value => {
        const variant = object(value)
        return { label: text(variant.label, 120, 'نام سایز'), price: price(variant.price), available: boolean(variant.available) }
      })
      if (variants.length > 30) throw new Error('تعداد سایزهای یک آیتم بیش از حد است.')
      const image = imageReference(item.imageUrl)
      if (image) ignoredImageCount++
      const name = text(item.name, 250, 'نام آیتم')
      if (name.length < 2) throw new Error('نام آیتم باید حداقل دو نویسه داشته باشد.')
      items.push({ section: sectionName, name, description: optionalText(item.description, 4000),
        price: itemPrice, available: boolean(item.available), featured: boolean(item.featured), archived: boolean(item.archived),
        variants, excludeFromPriceStats: boolean(item.excludeFromPriceStats),
        publicId: optionalText(item.publicId, 40), imageReference: image })
      if (items.length > MAX_PORTABLE_ITEMS) throw new Error(`فایل حداکثر ${MAX_PORTABLE_ITEMS} آیتم داشته باشد.`)
    }
  }
  if (!items.length) throw new Error('فایل آیتمی ندارد.')
  assertUnique(items)
  return { format: 'json', items, ignoredImageCount, ignoredMetadata: ['exportedAt', 'priceUpdatedAt', 'facetId', 'imageUrl'] }
}

/** RFC-style CSV reader with BOM, quoted commas, doubled quotes and multiline fields. */
export function readPortableCsv(raw: string): string[][] {
  const value = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), records: string[][] = [], cells: string[] = []
  let cell = '', quoted = false, closed = false
  const finishCell = () => { cells.push(cell); cell = ''; closed = false }
  const finishRow = () => { finishCell(); if (cells.some(part => part.length)) records.push([...cells]); cells.length = 0 }
  for (let index = 0; index < value.length; index++) {
    const char = value[index]!
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
    } else if (char === ',') finishCell()
    else if (char === '\n') finishRow()
    else if (char === '"' && !cell && !closed) quoted = true
    else {
      if (closed || char === '"') throw new Error('ساختار نقل‌قول CSV نامعتبر است.')
      cell += char
    }
    if (records.length > MAX_PORTABLE_ITEMS * 30 + 1) throw new Error('تعداد ردیف‌های CSV بیش از حد است.')
  }
  if (quoted) throw new Error('نقل‌قول CSV بسته نشده است.')
  if (cell || cells.length || closed) finishRow()
  return records
}

function csvPrice(value: string): number | null {
  const cleaned = toAsciiDigits(value.trim())
  if (cleaned === 'نامعلوم') return null
  if (!/^\d+$/.test(cleaned)) throw new Error('قیمت CSV باید عدد صحیح تومان یا «نامعلوم» باشد.')
  return price(Number(cleaned))
}

function parseCsv(raw: string): PortableMenu {
  const records = readPortableCsv(raw), header = records.shift()
  if (!header || header.length !== CSV_HEADERS.length || header.some((name, index) => name !== CSV_HEADERS[index])) throw new Error('ستون‌های CSV با خروجی منوی کو کافه یکسان نیستند.')
  if (!records.length) throw new Error('CSV آیتمی ندارد.')
  const groups = new Map<string, PortableItem>(), variants = new Map<string, Set<string>>(), plainRows = new Set<string>()
  for (const row of records) {
    if (row.length !== CSV_HEADERS.length) throw new Error('تعداد ستون‌های یک ردیف CSV معتبر نیست.')
    const [sectionRaw, nameRaw, descriptionRaw, itemPriceRaw, labelRaw, variantPriceRaw, availableRaw, archiveRaw, imageRaw] = row as [string, string, string, string, string, string, string, string, string]
    const section = text(sectionRaw, 200, 'نام دسته')
    if (section.length < 2) throw new Error('نام دسته باید حداقل دو نویسه داشته باشد.')
    const name = text(nameRaw.replace(/^\t(?=[=+\-@])/, ''), 250, 'نام آیتم')
    if (name.length < 2) throw new Error('نام آیتم باید حداقل دو نویسه داشته باشد.')
    const itemPrice = csvPrice(itemPriceRaw)
    if (!['موجود', 'ناموجود'].includes(availableRaw) || !['فعال', 'آرشیو شده'].includes(archiveRaw)) throw new Error('وضعیت موجودی یا آرشیو CSV معتبر نیست.')
    const key = `${normalizeFa(section)}\u0000${normalizeFa(name)}`, image = imageReference(imageRaw)
    const description = optionalText(descriptionRaw, 4000), archived = archiveRaw === 'آرشیو شده', available = availableRaw === 'موجود'
    let item = groups.get(key)
    if (!item) {
      item = { section, name, description, price: itemPrice, available, archived, featured: false,
        variants: [], excludeFromPriceStats: false, publicId: null, imageReference: image }
      groups.set(key, item)
      variants.set(key, new Set())
    } else {
      if (item.section !== section || item.name !== name || item.description !== description || item.price !== itemPrice ||
        item.archived !== archived || item.imageReference !== image) throw new Error('ردیف‌های یک آیتم در CSV با هم ناسازگارند.')
      item.available ||= available
    }
    if (labelRaw) {
      if (plainRows.has(key)) throw new Error('ردیف بدون سایز با ردیف سایزدار مخلوط شده است.')
      const label = text(labelRaw, 120, 'نام سایز'), variantKey = normalizeFa(label)
      if (variants.get(key)!.has(variantKey)) throw new Error('سایز تکراری در CSV وجود دارد.')
      variants.get(key)!.add(variantKey)
      item.variants.push({ label, price: csvPrice(variantPriceRaw), available })
    } else {
      if (variantPriceRaw || item.variants.length || plainRows.has(key)) throw new Error('ردیف سایز CSV ناقص یا تکراری است.')
      plainRows.add(key)
    }
    if (groups.size > MAX_PORTABLE_ITEMS) throw new Error(`فایل حداکثر ${MAX_PORTABLE_ITEMS} آیتم داشته باشد.`)
  }
  const items = [...groups.values()]
  assertUnique(items)
  return { format: 'csv', items, ignoredImageCount: items.filter(item => item.imageReference).length,
    ignoredMetadata: ['publicId', 'featured', 'excludeFromPriceStats', 'priceUpdatedAt', 'item/variant availability distinction', 'imageUrl'] }
}

export function parsePortableMenu(raw: string): PortableMenu {
  if (new TextEncoder().encode(raw).length > MAX_PORTABLE_BYTES) throw new Error('حجم فایل باید حداکثر ۵۱۲ کیلوبایت باشد.')
  const trimmed = raw.trimStart().replace(/^\uFEFF/, '').trimStart()
  return trimmed.startsWith('{') ? parseJson(trimmed) : parseCsv(raw)
}
