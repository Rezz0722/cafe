import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { eq } from 'drizzle-orm'
import { getDb } from '../src/db/client'
import { closeDb } from '../src/db/connection'
import { media } from '../src/db/schema'
import { storeUploadedImage } from '../src/core/media/upload'
import { mediaFullPath } from '../src/core/media/store'

const db = getDb()
const run = promisify(execFile)
let mediaId: number | null = null
let localPath: string | null = null

try {
  // import مستقیم sharp روی CPU قدیمی سرور، پیش از رسیدن تست به مسیر واقعی
  // شکست می‌خورد؛ fixture را با همان fallback پایدار تولید می‌کنیم.
  const { stdout } = await run(
    'convert',
    ['-size', '240x180', `xc:rgb(${Date.now() % 255},96,168)`, 'png:-'],
    { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 },
  )
  const png = Buffer.from(stdout)
  const result = await storeUploadedImage(new File([png], 'camera.png', { type: 'image/png' }))
  if (!result.ok) throw new Error(result.error)
  assert.equal(result.ok, true)
  mediaId = result.mediaId
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1)
  assert.ok(row?.localPath)
  localPath = row.localPath
  assert.equal(row.status, 'ok')
  assert.ok((row.width ?? 0) > 0 && (row.width ?? 0) <= 400)
  const publicRoot = resolve(process.cwd(), 'public')
  await Promise.all([
    access(resolve(publicRoot, localPath)),
    access(resolve(publicRoot, mediaFullPath(localPath))),
  ])
  console.log('✓ عکس واقعی پردازش و در registry ثبت شد')
  console.log('✓ نسخه کارت و نسخه بزرگ هر دو روی دیسک سالم‌اند')
} finally {
  if (mediaId) await db.delete(media).where(eq(media.id, mediaId))
  if (localPath) {
    const publicRoot = resolve(process.cwd(), 'public')
    await Promise.allSettled([
      rm(resolve(publicRoot, localPath), { force: true }),
      rm(resolve(publicRoot, mediaFullPath(localPath)), { force: true }),
    ])
  }
  await closeDb()
}
