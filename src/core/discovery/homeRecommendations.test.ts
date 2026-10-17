import test from 'node:test'
import assert from 'node:assert/strict'
import { pickHomeRecommendations } from './homeRecommendations'
import type { PlaceCard } from '@/core/places/queries'

function card(id: number, districtId: string | null, patch: Partial<PlaceCard> = {}): PlaceCard {
  return {
    id, districtId, slug: `cafe-${id}`, name: `کافه ${id}`, nameEn: null,
    kind: 'cafe', status: 'published', coords: null, geoStatus: 'missing', address: '',
    districtSlug: districtId, districtName: districtId, priceTier: 2, priceMedian: null,
    ribbon: null, signatureItem: null, cover: null, logo: null, ratingCount: 0,
    rating: 4.2, qualityScore: 50, facetIds: [], ...patch,
  }
}

test('homepage recommendations require a real, explainable signal and prefer district diversity', () => {
  const result = pickHomeRecommendations([
    card(1, 'a'),
    card(2, 'a', { ratingCount: 1, priceMedian: 0 }),
    card(3, 'a', { ratingCount: 4, priceMedian: 110000 }),
    card(4, 'b', { facetIds: ['coffee'] }),
    card(5, 'c', { priceMedian: 180000 }),
  ], 3)
  assert.deepEqual(result.map((item) => item.card.id), [2, 4, 5])
  assert.deepEqual(result.map((item) => item.reason), [
    'قیمت‌های منو ثبت شده', 'منوی دسته‌بندی‌شده', 'قیمت‌های منو ثبت شده',
  ])
  assert.deepEqual(pickHomeRecommendations([card(1, null)]), [])
})

test('homepage ranking does not fabricate a rating or equate one review to best', () => {
  const result = pickHomeRecommendations([
    card(1, 'a', { ratingCount: 1, rating: 5, facetIds: ['coffee'] }),
    card(2, 'b', { ratingCount: 3, rating: 4.4 }),
  ])
  assert.deepEqual(result.map((item) => item.reason), [
    'منوی دسته‌بندی‌شده', '۳ تجربهٔ تأییدشده',
  ])
})
