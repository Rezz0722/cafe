import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TOP_MENU_EXCLUSION_POLICY_VERSION,
  TOP_MENU_EXCLUDED_SOURCE_IDS,
  isTopMenuSourceExcluded,
} from './topMenuExclusions'

test('version 1 excludes exactly the four confirmed nonvenue source IDs', () => {
  assert.equal(TOP_MENU_EXCLUSION_POLICY_VERSION, 1)
  assert.deepEqual(TOP_MENU_EXCLUDED_SOURCE_IDS, [162, 248, 711, 731])
  assert.equal(new Set(TOP_MENU_EXCLUDED_SOURCE_IDS).size, 4)
  assert.equal(Object.isFrozen(TOP_MENU_EXCLUDED_SOURCE_IDS), true)
  for (const id of [162, 248, 711, 731]) assert.equal(isTopMenuSourceExcluded(id), true)
})

test('place IDs, neighboring sources and unconfirmed sources remain allowed', () => {
  for (const id of [92, 172, 403, 425, 161, 163, 247, 249, 710, 712, 730, 732,
    12, 25, 165, 375, 409, 392, 413, 367, 188, 159, 349, 365, 0, -1, NaN, Infinity]) {
    assert.equal(isTopMenuSourceExcluded(id), false, `source ID ${id}`)
  }
})
