// Package the existing, unchanged 64px brand PNG in a standard ICO container.
// Browsers may request /favicon.ico before streamed metadata reaches the head.
import { readFile, writeFile } from 'node:fs/promises'
const png = await readFile(new URL('../public/brand/favicon-64.png', import.meta.url))
if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('Brand favicon is not PNG')
const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
if (width !== 64 || height !== 64) throw new Error('Brand favicon must be 64 × 64')
const header = Buffer.alloc(22)
header.writeUInt16LE(1, 2) // ICO, not CUR
header.writeUInt16LE(1, 4) // one image
header[6] = width; header[7] = height
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, png]))
console.log('✓ Brand favicon.ico generated without changing the original image')
