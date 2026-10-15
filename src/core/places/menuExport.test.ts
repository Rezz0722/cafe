import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMenuCsv, buildMenuExport, escapeMenuCsvCell } from './menuExport'
import { createMenuExportResponse, parseMenuExportFormat, parseMenuExportPlaceId } from './menuExportResponse'
import type { OwnerPlaceData } from './manage'

test('menu export preserves prices, variants and archive state without leaking private or foreign data', () => {
  const at = new Date('2026-10-15T12:00:00.000Z')
  const item = {
    id: 44, publicId: 'public-44', name: 'لاته', description: 'با شیر',
    price: 120000, priceUnknown: false, excludeFromPriceStats: false,
    available: false, featured: true, archivedAt: at, imageUrl: '/media/latte.webp', priceUpdatedAt: at,
    variants: [{ id: 7, label: 'بزرگ', price: 150000, available: true, sortOrder: 0, priceUpdatedAt: at }],
  }
  const branch = {
    id: 11, name: 'قهوه', facetId: null, imageUrl: '/media/coffee-thumb.webp',
    imageFullUrl: '/media/coffee-full.webp', branchScope: 'branch' as const, items: [item],
  }
  const place = {
    id: 1, slug: 'qa-cafe', name: 'کافه تست', branchName: 'شعبه اول',
    phones: ['09300000000'], socials: [{ kind: 'instagram', url: 'private' }],
    sections: [branch, { ...branch, id: 12, name: 'شعبه دیگر', branchScope: 'other_branch' },
      { ...branch, id: 13, name: 'نامشخص', branchScope: 'unverified' }],
  } as unknown as OwnerPlaceData
  const result = buildMenuExport(place, at)
  const json = JSON.stringify(result)
  assert.equal(result.format, 'kucafe-menu')
  assert.equal(result.version, 1)
  assert.equal(result.priceUnit, 'toman')
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0]!.items[0]!.price, 120000)
  assert.equal(result.sections[0]!.items[0]!.variants[0]!.price, 150000)
  assert.equal(result.sections[0]!.items[0]!.archived, true)
  assert.equal(result.sections[0]!.items[0]!.priceUpdatedAt, at.toISOString())
  assert.match(result.sections[0]!.imageUrl ?? '', /^https?:\/\//)
  for (const secret of ['09300000000', 'private', 'شعبه دیگر', 'نامشخص', '"id":44', '"sourceId"']) {
    assert.equal(json.includes(secret), false, secret)
  }
})

test('menu export does not invent a price timestamp or turn zero into missing', () => {
  const data = {
    slug: 'qa', name: 'QA', branchName: null,
    sections: [{
      id: 1, name: 'نوشیدنی', facetId: null, imageUrl: null, imageFullUrl: null,
      branchScope: 'shared' as const,
      items: [{ id: 1, publicId: 'x', name: 'آب', description: null, price: 0, priceUnknown: false,
        excludeFromPriceStats: false, available: true, featured: false, archivedAt: null,
        imageUrl: null, priceUpdatedAt: null, variants: [] }],
    }],
  }
  const result = buildMenuExport(data, new Date('2026-10-15T12:00:00Z'))
  assert.equal(result.sections[0]!.items[0]!.price, 0)
  assert.equal(result.sections[0]!.items[0]!.priceUpdatedAt, null)
})

function csvFixture() {
  const item = {
    id: 1, publicId: 'qa-1', name: 'لاته، "ویژه"', description: 'خط اول، "دوم"\nادامه',
    price: null, priceUnknown: true, excludeFromPriceStats: false,
    available: true, featured: false, archivedAt: new Date('2026-10-15T12:00:00Z'),
    imageUrl: '/media/latte.webp', priceUpdatedAt: null,
    variants: [
      { id: 1, label: 'کوچک', price: 100000, available: true, sortOrder: 0, priceUpdatedAt: null },
      { id: 2, label: 'بزرگ', price: null, available: false, sortOrder: 1, priceUpdatedAt: null },
    ],
  }
  return buildMenuExport({
    slug: 'qa', name: 'کافهٔ نمونه', branchName: 'شعبه اول',
    sections: [{
      id: 1, name: 'نوشیدنی‌های گرم', facetId: null, imageUrl: null, imageFullUrl: null,
      branchScope: 'branch', items: [item, { ...item, id: 2, publicId: 'qa-2', name: 'آب',
        description: null, price: 0, priceUnknown: false, archivedAt: null, imageUrl: null, variants: [] }],
    }],
  }, new Date('2026-10-15T12:00:00Z'))
}

/** Independent RFC-style reader for testing delimiter, quote and multiline boundaries. */
function readCsv(text: string): string[][] {
  assert.equal(text[0], '\uFEFF')
  const rows: string[][] = [], row: string[] = []
  let field = '', quoted = false
  for (let index = 1; index < text.length; index++) {
    const char = text[index]!
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++ }
      else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(field); field = '' }
    else if (char === '\r' && text[index + 1] === '\n') {
      row.push(field); rows.push([...row]); row.length = 0; field = ''; index++
    } else assert.fail(`Unexpected unquoted CSV character: ${JSON.stringify(char)}`)
  }
  assert.equal(quoted, false)
  assert.equal(row.length, 0)
  assert.equal(field, '')
  return rows
}

test('Excel CSV has UTF-8 BOM, Persian columns, escaped multiline text and distinct unknown/zero prices', () => {
  const csv = buildMenuCsv(csvFixture())
  assert.deepEqual([...new TextEncoder().encode(csv).slice(0, 3)], [0xef, 0xbb, 0xbf])
  assert.ok(csv.endsWith('\r\n'))
  assert.match(csv, /"لاته، ""ویژه"""/)
  const rows = readCsv(csv)
  assert.equal(rows.length, 4)
  for (const row of rows) assert.equal(row.length, 9)
  assert.deepEqual(rows[0], ['نام دسته', 'نام آیتم', 'توضیح', 'قیمت (تومان)', 'نام سایز', 'قیمت سایز (تومان)', 'موجودی', 'وضعیت آرشیو', 'لینک تصویر'])
  assert.deepEqual(rows[1]?.slice(0, 8), ['نوشیدنی‌های گرم', 'لاته، "ویژه"', 'خط اول، "دوم"\nادامه', 'نامعلوم', 'کوچک', '100000', 'موجود', 'آرشیو شده'])
  assert.deepEqual(rows[2]?.slice(3, 8), ['نامعلوم', 'بزرگ', 'نامعلوم', 'ناموجود', 'آرشیو شده'])
  assert.deepEqual(rows[3]?.slice(1, 8), ['آب', '', '0', '', '', 'موجود', 'فعال'])
  assert.ok(rows[1]?.[8]?.endsWith('/media/latte.webp'))
  assert.equal(rows[3]?.[8], '')
})

test('CSV formula injection is neutralized even after whitespace or control prefixes', () => {
  const attacks = [
    '=SUM(1,1)', '+cmd', '-1+2', '@SUM(A1)',
    '  =HYPERLINK("https://evil.example")', '\t+cmd', '\r-cmd', '\n@cmd',
    '\u0000=cmd', '\u200B=cmd', '\u00A0=cmd', '\u202E=cmd',
  ]
  for (const attack of attacks) {
    const escaped = escapeMenuCsvCell(attack)
    assert.ok(escaped.startsWith('"\t'), JSON.stringify(attack))
    assert.match(escaped.slice(2), /^[=+\-@]/u, JSON.stringify(attack))
    assert.ok(escaped.endsWith('"'), JSON.stringify(attack))
  }
  assert.equal(escapeMenuCsvCell('normal",=1+1'), '"normal"",=1+1"')
  assert.equal(escapeMenuCsvCell('قهوه، خوب'), '"قهوه، خوب"')
  assert.equal(escapeMenuCsvCell(0), '"0"')
  assert.equal(escapeMenuCsvCell(null), '""')
})

test('CSV and JSON download responses use private attachment headers and preserve BOM bytes', async () => {
  const data = csvFixture()
  for (const format of ['csv', 'json'] as const) {
    const response = createMenuExportResponse(data, 42, format)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('x-robots-tag'), 'noindex')
    assert.equal(response.headers.get('content-disposition'), `attachment; filename="kucafe-menu-42.${format}"`)
    assert.equal(response.headers.get('content-type'), format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8')
    assert.equal(response.headers.get('set-cookie'), null)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (format === 'csv') assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf])
    else assert.equal(JSON.parse(new TextDecoder().decode(bytes)).format, 'kucafe-menu')
  }
})

test('download request accepts only CSV/JSON and a safe positive place identifier', () => {
  assert.equal(parseMenuExportFormat(null), 'json')
  assert.equal(parseMenuExportFormat('json'), 'json')
  assert.equal(parseMenuExportFormat('csv'), 'csv')
  assert.equal(parseMenuExportFormat('xlsx'), null)
  assert.equal(parseMenuExportPlaceId('42'), 42)
  for (const value of [null, '', '0', '-1', '1.5', '01', '999999999999999999']) {
    assert.equal(parseMenuExportPlaceId(value), null)
  }
})
