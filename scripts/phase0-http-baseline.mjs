/** Aggregate only: discard IPs, full URLs, queries and raw user agents. */
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { createGunzip } from 'node:zlib'
const inputs = process.argv.slice(2)
if (!inputs.length) throw new Error('Pass explicit Apache access log paths (.log or .gz)')
const since = Date.now() - 7 * 86400_000
const result = { capturedAt: new Date().toISOString(), requestedSince: new Date(since).toISOString(), firstObserved: null, lastObserved: null, requests: 0, statuses: {}, groups: {}, crawlerRequests: 0, classifiedUserRequests: 0, serverErrors: {} }
const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }
for (const path of inputs) {
  const file = createReadStream(path)
  const stream = path.endsWith('.gz') ? file.pipe(createGunzip()) : file
  for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
    const match = line.match(/\[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}:\d{2}:\d{2}) ([+-]\d{4})\] "\S+ (\S+) [^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/)
    if (!match) continue
    const timestamp = Date.parse(`${match[3]}-${months[match[2]]}-${match[1]}T${match[4]}${match[5].slice(0, 3)}:${match[5].slice(3)}`)
    if (timestamp < since) continue
    const at = new Date(timestamp).toISOString()
    if (!result.firstObserved || at < result.firstObserved) result.firstObserved = at
    if (!result.lastObserved || at > result.lastObserved) result.lastObserved = at
    const status = match[7], url = match[6].split('?')[0]
    const group = url === '/' ? 'home' : /^\/(search|auth|cafe|item|admin|profile|api|_next|media|mashhad|for-cafes)(?:\/|$)/.exec(url)?.[1] ?? 'other'
    result.requests++
    result.statuses[status] = (result.statuses[status] ?? 0) + 1
    result.groups[group] = (result.groups[group] ?? 0) + 1
    if (/bot|crawler|spider|crawl|headless|curl|wget|python|aiohttp/i.test(match[8])) result.crawlerRequests++
    else result.classifiedUserRequests++
    if (Number(status) >= 500) result.serverErrors[group] = (result.serverErrors[group] ?? 0) + 1
  }
}
result.limitation = 'User-agent classification is approximate; this is HTTP request traffic, not unique human visits. Coverage is limited to the explicit input files.'
const output = 'var/qa/phase0/http-baseline.json'
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(result, null, 2))
console.log(`Aggregate HTTP baseline saved: ${output}`)
