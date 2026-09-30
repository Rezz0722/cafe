import assert from 'node:assert/strict'
import test from 'node:test'
import { itemSlug, parseItemPublicId } from './identity'

test('item slug is readable Persian and punctuation-safe', () => {
  assert.equal(itemSlug('  پاستا آلفردو (ویژه)  '), 'پاستا-الفردو-ویژه')
  assert.equal(itemSlug(''), 'menu-item')
})

test('public id only accepts positive decimal source ids', () => {
  assert.equal(parseItemPublicId('123'), '123')
  assert.equal(parseItemPublicId('mi_ab12-CD'), 'mi_ab12-CD')
  assert.equal(parseItemPublicId('0'), null)
  assert.equal(parseItemPublicId('12x'), null)
})
