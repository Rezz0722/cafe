import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMenuCsv, buildMenuExport } from '@/core/places/menuExport'
import { MAX_PORTABLE_BYTES, parsePortableMenu, readPortableCsv } from './menuPortable'

const source = {
  slug: 'fixture', name: 'کافه آزمایشی', branchName: null,
  sections: [{ id: 1, name: 'نوشیدنی', facetId: null, imageUrl: null, imageFullUrl: null, branchScope: 'branch', items: [
    { id: 1, publicId: 'fixture-latte', name: 'لاته، "ویژه"', description: 'خط اول\nخط دوم', price: 100000,
      priceUnknown: false, available: true, featured: true, excludeFromPriceStats: false, archivedAt: null, imageUrl: null, priceUpdatedAt: null,
      variants: [{ id: 1, label: 'کوچک', price: 100000, available: true, sortOrder: 0, priceUpdatedAt: null },
        { id: 2, label: 'بزرگ', price: 150000, available: false, sortOrder: 1, priceUpdatedAt: null }] },
    { id: 2, publicId: 'fixture-water', name: 'آب رایگان', description: null, price: 0,
      priceUnknown: false, available: true, featured: false, excludeFromPriceStats: false, archivedAt: null, imageUrl: null, priceUpdatedAt: null, variants: [] },
    { id: 3, publicId: 'fixture-tea', name: 'چای روز', description: null, price: null,
      priceUnknown: true, available: false, featured: false, excludeFromPriceStats: false, archivedAt: new Date('2026-01-01T00:00:00Z'),
      imageUrl: null, priceUpdatedAt: null, variants: [] },
  ] }],
} as unknown as Parameters<typeof buildMenuExport>[0]

test('JSON v1 export parses without trusting IDs or timestamps; zero and unknown stay distinct', () => {
  const raw = JSON.stringify(buildMenuExport(source, new Date('2026-01-01T00:00:00Z')))
  const parsed = parsePortableMenu(raw)
  assert.equal(parsed.format, 'json')
  assert.equal(parsed.items.length, 3)
  assert.equal(parsed.items[0]!.price, 100000)
  assert.equal(parsed.items[0]!.variants[1]!.available, false)
  assert.equal(parsed.items[0]!.featured, true)
  assert.equal(parsed.items[1]!.price, 0)
  assert.equal(parsed.items[2]!.price, null)
  assert.equal(parsed.items[2]!.archived, true)
  assert.equal(parsed.items[0]!.publicId, 'fixture-latte')
  assert.ok(parsed.ignoredMetadata.includes('priceUpdatedAt'))
})

test('Excel CSV export parses BOM, Persian headers, quotes, multiline and sizes', () => {
  const csv = buildMenuCsv(buildMenuExport(source, new Date('2026-01-01T00:00:00Z')))
  assert.deepEqual([...new TextEncoder().encode(csv).slice(0, 3)], [0xef, 0xbb, 0xbf])
  assert.equal(readPortableCsv(csv).length, 5)
  const parsed = parsePortableMenu(csv)
  assert.equal(parsed.format, 'csv')
  assert.equal(parsed.items.length, 3)
  assert.equal(parsed.items[0]!.name, 'لاته، "ویژه"')
  assert.equal(parsed.items[0]!.description, 'خط اول\nخط دوم')
  assert.equal(parsed.items[0]!.variants.length, 2)
  assert.equal(parsed.items[1]!.price, 0)
  assert.equal(parsed.items[2]!.price, null)
  assert.equal(parsed.items[2]!.archived, true)
  assert.equal(parsed.items[0]!.publicId, null)
  assert.equal(parsed.items[0]!.featured, false)
})

test('invalid version, unit, unsafe keys, bad price and malformed/oversized CSV fail closed', () => {
  const base = buildMenuExport(source, new Date('2026-01-01T00:00:00Z'))
  for (const altered of [{ ...base, version: 2 }, { ...base, priceUnit: 'rial' },
    { ...base, sections: [{ ...base.sections[0], items: [{ ...base.sections[0]!.items[0], price: -1 }] }] },
    { ...base, sections: [{ ...base.sections[0], items: [{ ...base.sections[0]!.items[0], priceUnknown: true }] }] }]) {
    assert.throws(() => parsePortableMenu(JSON.stringify(altered)))
  }
  assert.throws(() => parsePortableMenu('{"format":"kucafe-menu","version":1,"priceUnit":"toman","place":{},"sections":[],"__proto__":{}}'))
  assert.throws(() => parsePortableMenu('{broken'))
  assert.throws(() => parsePortableMenu('"unclosed'))
  assert.throws(() => parsePortableMenu('a'.repeat(MAX_PORTABLE_BYTES + 1)))
  const csv = buildMenuCsv(base)
  assert.throws(() => parsePortableMenu(csv.replace('قیمت (تومان)', 'قیمت (ریال)')))
  assert.throws(() => parsePortableMenu(csv.replace('"100000"', '"100001"')))
})

test('formula-neutralized CSV cells remain text and duplicate normalized item names are rejected', () => {
  const base = buildMenuExport(source, new Date('2026-01-01T00:00:00Z'))
  const formula = { ...base, sections: [{ ...base.sections[0]!, items: [{ ...base.sections[0]!.items[0]!,
    name: '=SUM(1,1)', variants: [], price: 0 }] }] }
  const parsed = parsePortableMenu(buildMenuCsv(formula))
  assert.equal(parsed.items[0]!.name, '=SUM(1,1)')
  const duplicate = { ...base, sections: [{ ...base.sections[0]!, items: [base.sections[0]!.items[0]!,
    { ...base.sections[0]!.items[0]!, publicId: 'other', name: 'لاته، "ویژه"' }] }] }
  assert.throws(() => parsePortableMenu(JSON.stringify(duplicate)))
  const duplicateId = { ...base, sections: [{ ...base.sections[0]!, items: [base.sections[0]!.items[0]!,
    { ...base.sections[0]!.items[0]!, name: 'موکا تازه' }] }] }
  assert.throws(() => parsePortableMenu(JSON.stringify(duplicateId)))
})
