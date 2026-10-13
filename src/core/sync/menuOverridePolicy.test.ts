import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeItemSource, sourceFieldConflicts } from './menuOverridePolicy'

test('two consecutive source syncs preserve only fields edited by the venue', () => {
  const owner = { name: 'لاته مخصوص', description: 'شیر تازه', price: 135000, priceUnknown: false, available: false, featured: false, sectionId: 8, archivedAt: null }
  const fields = new Set(['name', 'price', 'available'])
  const first = mergeItemSource(owner, { ...owner, name: 'لاته', description: 'منبع یک', price: 100000, priceUnknown: false, available: true, featured: true, sectionId: 7 }, fields)
  assert.equal(first.name, owner.name)
  assert.equal(first.price, owner.price)
  assert.equal(first.available, owner.available)
  assert.equal(first.description, 'منبع یک')
  assert.equal(first.featured, true)
  const second = mergeItemSource(first, { ...first, name: 'لاته جدید', description: 'منبع دو', price: 110000, priceUnknown: false, available: true }, fields)
  assert.equal(second.name, owner.name)
  assert.equal(second.price, owner.price)
  assert.equal(second.available, owner.available)
  assert.equal(second.description, 'منبع دو')
  assert.deepEqual(mergeItemSource(second, { ...second }, fields), second)
})

test('price override retains unknown-price flag, even when provider price changes unit', () => {
  const current: { name: string; price: number | null; priceUnknown: boolean } = { name: 'قهوه', price: null, priceUnknown: true }
  const effective = mergeItemSource(current, { name: 'قهوه', price: 120000, priceUnknown: false }, new Set(['price']))
  assert.equal(effective.price, null)
  assert.equal(effective.priceUnknown, true)
})

test('archived owner item is not reactivated and protected conflicts are visible', () => {
  const archivedAt = new Date('2026-10-01T12:00:00Z')
  const current: { name: string; price: number | null; priceUnknown: boolean; archivedAt: Date | null } = { name: 'چای', price: 50000, priceUnknown: false, archivedAt }
  const proposal = { ...current, archivedAt: null, price: 60000 }
  const fields = new Set(['archivedAt'])
  const effective = mergeItemSource(current, proposal, fields)
  assert.equal(effective.archivedAt, archivedAt)
  assert.equal(effective.price, 60000)
  assert.deepEqual(sourceFieldConflicts(current, proposal, fields, 'item', 10).map(c => c.field), ['archivedAt'])
})
