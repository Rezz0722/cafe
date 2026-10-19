import assert from 'node:assert/strict'
import test from 'node:test'
import { groupMenuFacets, menuSort } from './discovery'

test('menu groups retain every valid destination once, including future facet kinds', () => {
  const facets = [
    { id: 'coffee', kind: 'drink' }, { id: 'brewed_coffee', kind: 'drink' },
    { id: 'breakfast', kind: 'menu' }, { id: 'pizza', kind: 'menu' },
    { id: 'main_dish', kind: 'cuisine' }, { id: 'hookah', kind: 'service' },
    { id: 'future', kind: 'future' }, { id: 'addons', kind: 'service' },
    { id: 'service', kind: 'service' },
  ]
  const grouped = groupMenuFacets(facets).flatMap(group => group.facets.map(facet => facet.id))
  assert.deepEqual(grouped, ['coffee', 'brewed_coffee', 'breakfast', 'pizza', 'main_dish', 'hookah', 'future'])
  assert.equal(new Set(grouped).size, grouped.length)
})

test('category sorting accepts existing server sorts and safely ignores malformed values', () => {
  for (const sort of ['rating', 'quality', 'name', 'price_asc', 'price_desc'] as const) {
    assert.equal(menuSort(sort), sort)
  }
  for (const invalid of [undefined, '', 'distance', ['name', 'rating'], 'name; DROP TABLE place']) {
    assert.equal(menuSort(invalid), 'rating')
  }
})
