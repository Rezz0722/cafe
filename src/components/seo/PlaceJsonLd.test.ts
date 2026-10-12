import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPlaceJsonLdData } from './PlaceJsonLd'

function structuredPlace(address: string, priceTier?: number): Record<string, unknown> {
  const data = buildPlaceJsonLdData({
    place: { name: 'کافه آزمایشی', slug: 'test-cafe', address, coords: null, priceTier },
    locale: { cityName: 'مشهد', regionName: 'خراسان رضوی', countryCode: 'IR' },
  })
  return data
}

test('locationless source listings do not claim a street, city or region in JSON-LD', () => {
  const data = structuredPlace('  ')
  assert.equal('address' in data, false)
  assert.equal('priceRange' in data, false)
  assert.equal(data['@type'], 'LocalBusiness')
})

test('a known address remains present in place JSON-LD', () => {
  const data = structuredPlace('  خیابان نمونه ۱  ', 2)
  assert.equal(data['@type'], 'CafeOrCoffeeShop')
  assert.equal(data.priceRange, '$$')
  assert.deepEqual(data.address, {
    '@type': 'PostalAddress', streetAddress: 'خیابان نمونه ۱',
    addressLocality: 'مشهد', addressRegion: 'خراسان رضوی', addressCountry: 'IR',
  })
})
