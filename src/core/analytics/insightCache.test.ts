import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInsightCache } from './insightCache'

test('insight cache loads on demand, coalesces readers and preserves exact data', async () => {
  let calls = 0, complete!: (value: number[]) => void
  const get = createInsightCache(() => { calls++; return new Promise<number[]>(resolve => { complete = resolve }) }, 60_000, () => 100)
  assert.equal(calls, 0)
  const first = get(), second = get()
  assert.equal(first, second)
  await Promise.resolve(); assert.equal(calls, 1)
  complete([21, 9])
  assert.deepEqual(await first, { value: [21, 9], generatedAt: 100 })
  assert.equal(await second, await get()); assert.equal(calls, 1)
})

test('insight freshness starts after computation and expires at TTL without parallel recomputations', async () => {
  let time = 0, calls = 0
  const get = createInsightCache(async () => { calls++; time += 8_000; return calls }, 60_000, () => time)
  assert.deepEqual(await get(), { value: 1, generatedAt: 8_000 })
  time = 67_999; assert.equal((await get()).value, 1)
  time = 68_000
  const [one, two] = await Promise.all([get(), get()])
  assert.equal(one, two); assert.equal(one.value, 2); assert.equal(calls, 2)
})

test('failed reports are never cached and subsequent reads can recover', async () => {
  let calls = 0
  const get = createInsightCache(async () => { if (++calls === 1) throw new Error('DB unavailable'); return 42 }, 60_000)
  const first = get(), second = get()
  await assert.rejects(first, /DB unavailable/); await assert.rejects(second, /DB unavailable/)
  assert.equal((await get()).value, 42); assert.equal(calls, 2)
})

test('a synchronously failing loader does not poison pending report state', async () => {
  let calls = 0
  const get = createInsightCache(() => { if (++calls === 1) throw new Error('sync failure'); return Promise.resolve('recovered') }, 60_000)
  await assert.rejects(get(), /sync failure/)
  assert.equal((await get()).value, 'recovered')
})
