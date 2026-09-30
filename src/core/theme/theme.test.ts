import test from 'node:test'
import assert from 'node:assert/strict'
import { isThemeMode, resolveTheme } from './theme'

test('theme mode validation accepts only public modes', () => {
  assert.equal(isThemeMode('light'), true)
  assert.equal(isThemeMode('dark'), true)
  assert.equal(isThemeMode('auto'), true)
  assert.equal(isThemeMode('tehran'), false)
})

test('Automatic mode follows the device preference', () => {
  assert.equal(resolveTheme('auto', 'light'), 'light')
  assert.equal(resolveTheme('auto', 'dark'), 'dark')
  assert.equal(resolveTheme('light', 'dark'), 'light')
  assert.equal(resolveTheme('dark', 'light'), 'dark')
})
