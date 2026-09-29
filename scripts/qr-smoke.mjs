import jsQR from 'jsqr'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const RASTER_SIZE = 410 // ماتریس ۴۱×۴۱ با پیکسل‌های دقیق ۱۰تایی

const base = process.argv[2] ?? 'http://127.0.0.1:9091'
const slug = process.argv[3] ?? 'ramouz-cafe'
const expected = new URL(`/cafe/${slug}`, process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kucafe.ir').toString()
const endpoint = new URL(`/api/qr/cafe/${encodeURIComponent(slug)}`, base)

const response = await fetch(endpoint)
if (!response.ok) throw new Error(`QR endpoint returned ${response.status}`)
if (!response.headers.get('content-type')?.includes('image/svg+xml')) {
  throw new Error(`unexpected content type: ${response.headers.get('content-type')}`)
}
const svg = Buffer.from(await response.arrayBuffer())
if (svg.length < 500) throw new Error('SVG QR is unexpectedly small')

const temp = await mkdtemp(join(tmpdir(), 'kucafe-qr-'))
let raw
try {
  const input = join(temp, 'qr.svg')
  await writeFile(input, svg)
  const { stdout } = await run(
    'convert',
    [input, '-background', 'white', '-alpha', 'remove', '-filter', 'point', '-resize', `${RASTER_SIZE}x${RASTER_SIZE}!`, '-colorspace', 'gray', '-threshold', '50%', '-colorspace', 'sRGB', '-type', 'TrueColorAlpha', '-depth', '8', 'rgba:-'],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  )
  raw = Buffer.from(stdout)
} finally {
  await rm(temp, { recursive: true, force: true })
}
if (raw.length !== RASTER_SIZE * RASTER_SIZE * 4) throw new Error('unexpected raster dimensions')
const decoded = jsQR(new Uint8ClampedArray(raw), RASTER_SIZE, RASTER_SIZE)
if (!decoded) throw new Error('QR decoder could not read generated image')
if (decoded.data !== expected) {
  throw new Error(`QR destination mismatch: ${decoded.data} !== ${expected}`)
}

console.log(`✓ QR قابل اسکن است — ${decoded.data}`)
console.log(`✓ خروجی SVG باکیفیت است — ${svg.length.toLocaleString('fa-IR')} بایت`)
