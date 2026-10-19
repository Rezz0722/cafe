import assert from 'node:assert/strict'
import test from 'node:test'
import { isHeaderDestinationCurrent } from './siteHeaderState'

test('food navigation does not also activate the district destination', () => {
  for (const pathname of ['/mashhad/menu', '/mashhad/menu/coffee']) {
    assert.equal(isHeaderDestinationCurrent(pathname, '/mashhad/menu'), true)
    assert.equal(isHeaderDestinationCurrent(pathname, '/mashhad'), false)
  }
})

test('district navigation is scoped to the district hub and details', () => {
  assert.equal(isHeaderDestinationCurrent('/mashhad', '/mashhad'), true)
  assert.equal(isHeaderDestinationCurrent('/mashhad/vakilabad', '/mashhad'), true)
  for (const pathname of ['/mashhad/experience', '/mashhad/experience/work', '/search']) {
    assert.equal(isHeaderDestinationCurrent(pathname, '/mashhad'), false)
  }
  assert.equal(isHeaderDestinationCurrent('/', '/#for-venues'), false)
})
