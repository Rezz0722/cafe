import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MenuViewGate, MENU_VIEW_WINDOW, menuRequestCountable, parseMenuView } from './menuPolicy'
const event = () => ({ kind: 'section' as const, placeId: 1, targetId: 2, eventId: randomUUID() })
test('menu events accept only known kind, int32 identifiers and v4 nonce', () => {
  assert.deepEqual(parseMenuView(event())?.kind, 'section')
  for (const patch of [{ kind: 'sale' }, { targetId: -1 }, { targetId: 2.2 }, { targetId: '2' }, { placeId: 2147483648 }, { eventId: '-'.repeat(36) }, { eventId: randomUUID().toUpperCase() }]) assert.equal(parseMenuView({ ...event(), ...patch }), null)
  for (const value of [null, [], 0, 'x']) assert.equal(parseMenuView(value), null)
})
test('same-origin JSON humans only; private preference and prefetch excluded', () => {
  const headers = { origin: 'https://kucafe.ir', 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 Android' }
  assert.equal(menuRequestCountable(new Headers(headers), headers.origin), true)
  const patches: Record<string, string>[] = [{ origin: 'https://evil.example' }, { origin: '' }, { 'content-type': 'text/plain' }, { 'user-agent': 'Googlebot' }, { 'user-agent': '' }, { dnt: '1' }, { 'sec-gpc': '1' }, { purpose: 'prefetch' }, { 'sec-purpose': 'prerender' }]
  for (const patch of patches) assert.equal(menuRequestCountable(new Headers({ ...headers, ...patch }), headers.origin), false)
})
test('retry nonce dedupes per scoped target until expiry; distinct targets stay independent', () => {
  const gate = new MenuViewGate(), view = event(), now = 1000
  assert.equal(gate.accept(view, now), true)
  assert.equal(gate.accept(view, now + 1), false)
  assert.equal(gate.accept({ ...view, targetId: 3 }, now + 1), true)
  assert.equal(gate.accept(view, now + MENU_VIEW_WINDOW), true)
})
test('bounded process write ceiling resets after minute', () => {
  const gate = new MenuViewGate()
  for (let i = 0; i < 600; i++) assert.equal(gate.accept(event(), 1000), true)
  assert.equal(gate.accept(event(), 2000), false)
  assert.equal(gate.accept(event(), 61000), true)
})
