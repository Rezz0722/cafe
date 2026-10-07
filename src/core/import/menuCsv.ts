import { cleanUserText } from '@/core/security/input'
import { normalizeFa } from '@/core/text/normalize'

export const MAX_MENU_IMPORT_BYTES = 65536
export const MAX_MENU_IMPORT_ROWS = 100
export const MAX_MENU_IMPORT_APPLY = 20
export type MenuDelimiter = ',' | ';' | '\t'
export interface MenuCsvRow { index: number; name: string; price: number | null; description: string | null; error?: string }
export interface MenuImportPreview {
  rows: (MenuCsvRow & { duplicate: boolean })[]
  token: string
  revision: string
  sectionId: number
  sectionName: string
}
export const MENU_CSV_TEMPLATE = 'name,price,description\nلاته,120000,قیمت به تومان\nچای,,قیمت روز\n'

export function parseMenuCsv(raw: string, delimiter: string): MenuCsvRow[] {
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('جداکنندهٔ فایل معتبر نیست.')
  if (new TextEncoder().encode(raw).length > MAX_MENU_IMPORT_BYTES) throw new Error('حجم متن باید حداکثر ۶۴ کیلوبایت باشد.')
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const records: string[][] = [], fields: string[] = []
  let field = '', quoted = false, endedQuote = false
  const finishField = () => { fields.push(field); field = ''; endedQuote = false }
  const finishRecord = () => {
    finishField()
    if (fields.some(value => value.trim())) records.push([...fields])
    fields.length = 0
    if (records.length > MAX_MENU_IMPORT_ROWS + 1) throw new Error('هر فایل حداکثر ۱۰۰ ردیف آیتم داشته باشد.')
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (char === '"') { quoted = false; endedQuote = true }
      else field += char
    } else if (char === delimiter) finishField()
    else if (char === '\n') finishRecord()
    else if (char === '"') {
      if (field || endedQuote) throw new Error('نقل‌قول فایل درست نیست؛ متن دارای جداکننده را بین دو " قرار دهید.')
      quoted = true
    } else {
      if (endedQuote) throw new Error('پس از نقل‌قول بسته فقط جداکننده یا پایان خط مجاز است.')
      field += char
    }
  }
  if (quoted) throw new Error('نقل‌قول بسته نشده است.')
  if (field || fields.length || endedQuote) finishRecord()
  const header = records.shift()?.map(value => value.trim())
  if (!header || header.join('|') !== 'name|price|description') throw new Error('خط اول باید دقیقاً name,price,description باشد؛ جداکنندهٔ انتخاب‌شده را هم بررسی کنید.')
  if (!records.length) throw new Error('فایل آیتمی ندارد.')
  const keys = new Set<string>()
  return records.map((record, index) => {
    const name = cleanUserText(record[0], 251), description = cleanUserText(record[2], 4001) || null
    const originalPrice = (record[1] ?? '').trim()
    const digits = originalPrice.replace(/[۰-۹]/g, char => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char))).replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    const validFormat = /^\d+$/.test(digits) || /^\d{1,3}(?:[,٬]\d{3})+$/.test(digits)
    const price = originalPrice === '' ? null : Number(digits.replace(/[,٬]/g, ''))
    let error: string | undefined
    if (record.length !== 3) error = 'این ردیف باید سه ستون داشته باشد.'
    else if (name.length < 2 || name.length > 250) error = 'نام آیتم بین ۲ تا ۲۵۰ نویسه باشد.'
    else if ((description?.length ?? 0) > 4000) error = 'توضیح حداکثر ۴۰۰۰ نویسه باشد.'
    else if (price !== null && (!validFormat || !Number.isSafeInteger(price) || price < 0 || price > 2147483647)) error = 'قیمت، عدد صحیح تومان تا ۲۱۴۷۴۸۳۶۴۷ باشد؛ برای قیمت روز خالی بگذارید.'
    const key = normalizeFa(name)
    if (!error && keys.has(key)) error = 'نام تکراری در همین فایل؛ فقط اولین ردیف قابل انتخاب است.'
    if (!error) keys.add(key)
    return { index, name, price, description, error }
  })
}

export function selectMenuRows(raw: string, rows: MenuImportPreview['rows']) {
  let selected: unknown
  try { selected = JSON.parse(raw) } catch { throw new Error('انتخاب ردیف‌ها معتبر نیست.') }
  if (!Array.isArray(selected) || !selected.length || selected.length > MAX_MENU_IMPORT_APPLY || selected.some(index => !Number.isSafeInteger(index) || index < 0) || new Set(selected).size !== selected.length) throw new Error('در هر ثبت، ۱ تا ۲۰ ردیف غیرتکراری را انتخاب کنید.')
  return selected.map(index => {
    const row = rows[index]
    if (!row || row.index !== index || row.error || row.duplicate) throw new Error('بعضی ردیف‌های انتخاب‌شده قابل افزودن نیستند؛ پیش‌نمایش را تازه کنید.')
    return row
  })
}
