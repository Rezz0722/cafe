import test from 'node:test'
import assert from 'node:assert/strict'
import { sameOrigin, validateConsoleMessage, validateConsoleMessageKind } from './consolePolicy'

test('owner messages are bounded and normalized', () => {
  assert.equal(validateConsoleMessage('  الان چه می‌کنی؟  '), 'الان چه می‌کنی؟')
  assert.equal(validateConsoleMessage('x'.repeat(2001)), null)
  assert.equal(validateConsoleMessage('x'), null)
  assert.equal(validateConsoleMessage('bad\u0000text'), null)
})
test('message writes require exact browser origin', () => {
  assert.equal(sameOrigin('https://kucafe.ir', 'https://kucafe.ir'), true)
  assert.equal(sameOrigin(null, 'https://kucafe.ir'), false)
  assert.equal(sameOrigin('https://evil.invalid', 'https://kucafe.ir'), false)
})
test('only question or bounded work request types enter the owner inbox', () => {
  assert.equal(validateConsoleMessageKind('question'), 'question')
  assert.equal(validateConsoleMessageKind('work'), 'work')
  assert.equal(validateConsoleMessageKind('deploy-now'), null)
  assert.equal(validateConsoleMessageKind(null), null)
})
