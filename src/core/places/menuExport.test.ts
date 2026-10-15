import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMenuExport } from './menuExport'
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
