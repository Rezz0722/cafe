import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canGrantPlaceRole,
  canManagePlaceUsers,
  canWritePlace,
} from './authorization'

test('cross-place access is denied when the place role is absent', () => {
  assert.equal(canWritePlace('owner', null), false)
  assert.equal(canWritePlace('customer', null), false)
})

test('a manager can edit only an assigned place but cannot manage people', () => {
  assert.equal(canWritePlace('owner', 'manager'), true)
  assert.equal(canManagePlaceUsers('owner', 'manager'), false)
})

test('venue owners can invite managers but cannot elevate another owner', () => {
  assert.equal(canManagePlaceUsers('owner', 'owner'), true)
  assert.equal(canGrantPlaceRole('owner', 'owner', 'manager'), true)
  assert.equal(canGrantPlaceRole('owner', 'owner', 'owner'), false)
})

test('system administrators retain explicit global access', () => {
  assert.equal(canWritePlace('admin', null), true)
  assert.equal(canManagePlaceUsers('admin', null), true)
  assert.equal(canGrantPlaceRole('admin', null, 'owner'), true)
})
