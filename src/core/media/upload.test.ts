import test from 'node:test'
import assert from 'node:assert/strict'
import { storeUploadedImage } from './upload'

test('آپلود خالی پیش از دسترسی به دیتابیس رد می‌شود', async () => {
  const result = await storeUploadedImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /خالی/)
})

test('فایل غیرتصویری پیش از پردازش رد می‌شود', async () => {
  const result = await storeUploadedImage(new File(['hello'], 'note.txt', { type: 'text/plain' }))
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /فرمت/)
})

test('فایل بزرگ‌تر از سقف هشت مگابایت رد می‌شود', async () => {
  const result = await storeUploadedImage(
    new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'huge.jpg', { type: 'image/jpeg' }),
  )
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /۸ مگابایت/)
})
