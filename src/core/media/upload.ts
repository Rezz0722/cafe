import 'server-only'

import { access, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { and, eq, isNotNull } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { media as mediaTable } from '@/db/schema'
import { deriveImage } from './derive'
import { hashContent, hashUrl, mediaFullPath, mediaRelativePath } from './store'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export type StoredUpload =
  | { ok: true; mediaId: number }
  | { ok: false; error: string }

async function usableFile(relative: string): Promise<boolean> {
  const publicRoot = resolve(process.cwd(), 'public')
  try {
    const [card, full] = await Promise.all([
      stat(resolve(publicRoot, relative)),
      stat(resolve(publicRoot, mediaFullPath(relative))),
    ])
    return card.size > 0 && full.size > 0
  } catch {
    return false
  }
}

/** ذخیرهٔ امن عکس ارسالی مدیر و ثبت/بازیافت آن در registry رسانه. */
export async function storeUploadedImage(file: File): Promise<StoredUpload> {
  if (!file.size) return { ok: false, error: 'فایل تصویر خالی است.' }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'حجم تصویر باید کمتر از ۸ مگابایت باشد.' }
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return { ok: false, error: 'فرمت تصویر باید JPG، PNG، WebP یا AVIF باشد.' }
  }

  const input = Buffer.from(await file.arrayBuffer())
  const contentHash = hashContent(input)
  const db = getDb()

  const [reusable] = await db
    .select({ id: mediaTable.id, localPath: mediaTable.localPath })
    .from(mediaTable)
    .where(
      and(
        eq(mediaTable.contentHash, contentHash),
        eq(mediaTable.status, 'ok'),
        isNotNull(mediaTable.localPath),
      ),
    )
    .limit(1)
  if (reusable?.localPath && await usableFile(reusable.localPath)) {
    return { ok: true, mediaId: reusable.id }
  }

  const derived = await deriveImage(input)
  if (!derived) return { ok: false, error: 'فایل انتخاب‌شده تصویر سالم و قابل پردازش نیست.' }
  if (derived.source.width < 120 || derived.source.height < 120) {
    return { ok: false, error: 'تصویر خیلی کوچک است؛ حداقل اندازه ۱۲۰ در ۱۲۰ پیکسل است.' }
  }
  if (derived.source.width > 12_000 || derived.source.height > 12_000) {
    return { ok: false, error: 'ابعاد تصویر بیش از حد بزرگ است.' }
  }

  const sourceUrl = `upload://${contentHash}`
  const urlHash = hashUrl(sourceUrl)
  const relative = mediaRelativePath('upload', urlHash, 'webp')
  const publicRoot = resolve(process.cwd(), 'public')
  const cardPath = resolve(publicRoot, relative)
  const fullPath = resolve(publicRoot, mediaFullPath(relative))

  await db
    .insert(mediaTable)
    .values({
      urlHash,
      sourceUrl,
      kind: 'upload',
      status: 'pending',
      attempts: 1,
      contentHash,
    })
    .onDuplicateKeyUpdate({ set: { status: 'pending', error: null } })
  const [registered] = await db
    .select({ id: mediaTable.id })
    .from(mediaTable)
    .where(eq(mediaTable.urlHash, urlHash))
    .limit(1)
  if (!registered) return { ok: false, error: 'ثبت تصویر انجام نشد.' }

  const suffix = `.tmp-${randomUUID()}`
  const cardTmp = `${cardPath}${suffix}`
  const fullTmp = `${fullPath}${suffix}`
  try {
    await mkdir(dirname(cardPath), { recursive: true })
    await Promise.all([
      writeFile(cardTmp, derived.card.buffer),
      writeFile(fullTmp, derived.full.buffer),
    ])
    await Promise.all([rename(cardTmp, cardPath), rename(fullTmp, fullPath)])
    await Promise.all([access(cardPath), access(fullPath)])

    await db
      .update(mediaTable)
      .set({
        localPath: relative,
        format: 'webp',
        width: derived.card.width,
        height: derived.card.height,
        bytes: derived.card.buffer.length + derived.full.buffer.length,
        contentHash,
        status: 'ok',
        fetchedAt: new Date(),
        error: null,
      })
      .where(eq(mediaTable.id, registered.id))
    return { ok: true, mediaId: registered.id }
  } catch {
    await Promise.allSettled([rm(cardTmp, { force: true }), rm(fullTmp, { force: true })])
    await db
      .update(mediaTable)
      .set({ status: 'failed', error: 'ذخیرهٔ فایل روی دیسک انجام نشد.' })
      .where(eq(mediaTable.id, registered.id))
    return { ok: false, error: 'ذخیرهٔ تصویر انجام نشد؛ دوباره تلاش کنید.' }
  }
}
