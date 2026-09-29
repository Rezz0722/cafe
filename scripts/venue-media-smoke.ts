import assert from 'node:assert/strict'
import { asc, eq } from 'drizzle-orm'
import { getDb } from '../src/db/client'
import { closeDb } from '../src/db/connection'
import { auditLog, media, place, placePhoto } from '../src/db/schema'
import {
  addPlacePhotos,
  deletePlacePhoto,
  loadOwnerPlace,
  movePlacePhoto,
  setPlaceCover,
  setPlaceLogo,
} from '../src/core/places/manage'
import { getPlaceDetail } from '../src/core/places/queries'

const db = getDb()
const actor = { userId: 'venue-media-smoke', label: 'venue-media-smoke' }
let placeId: number | null = null

function ok(label: string) {
  console.log(`✓ ${label}`)
}

try {
  const mediaRows = await db.select({ id: media.id }).from(media).where(eq(media.status, 'ok')).limit(2)
  assert.equal(mediaRows.length, 2, 'برای تست دو رسانه سالم لازم است')
  const [created] = await db.insert(place).values({
    slug: `venue-media-smoke-${Date.now()}`,
    name: 'کافه آزمایشی گالری',
    nameNormalized: 'کافه آزمایشی گالری',
    status: 'draft',
    source: 'owner',
  }).$returningId()
  placeId = created!.id

  const added = await addPlacePhotos(placeId, mediaRows.map((row) => ({ mediaId: row.id })), actor)
  assert.equal(added.ok, true)
  assert.equal(added.added, 2)
  ok('چند تصویر در یک عملیات به همان شعبه متصل شد')

  let rows = await db.select().from(placePhoto).where(eq(placePhoto.placeId, placeId)).orderBy(asc(placePhoto.sortOrder))
  assert.equal(rows.length, 2)
  let [record] = await db.select().from(place).where(eq(place.id, placeId)).limit(1)
  assert.equal(record!.coverMediaId, rows[0]!.mediaId)
  ok('اولین تصویر خودکار تصویر اصلی شد')

  await movePlacePhoto(placeId, rows[1]!.id, 'up', actor)
  const moved = await db.select().from(placePhoto).where(eq(placePhoto.placeId, placeId)).orderBy(asc(placePhoto.sortOrder))
  assert.equal(moved[0]!.id, rows[1]!.id)
  ok('مرتب‌سازی گالری پایدار است')

  await setPlaceCover(placeId, rows[1]!.id, actor)
  await setPlaceLogo(placeId, rows[0]!.mediaId, actor)
  record = (await db.select().from(place).where(eq(place.id, placeId)).limit(1))[0]
  assert.equal(record!.coverMediaId, rows[1]!.mediaId)
  assert.equal(record!.logoMediaId, rows[0]!.mediaId)
  ok('لوگو و تصویر اصلی دو نقش داده‌ای مستقل دارند')

  const ownerView = await loadOwnerPlace(placeId)
  assert.equal(ownerView?.photos.length, 2)
  assert.equal(ownerView?.qualityScore, 9)
  ok('امتیاز تکمیل از تصاویر واقعی گالری محاسبه شد')

  const publicBySlug = await getPlaceDetail(ownerView!.slug, { includeUnpublished: true })
  assert.equal(publicBySlug?.photos.length, 2)
  assert.equal(publicBySlug?.cover?.url, ownerView?.photos.find((photo) => photo.mediaId === record!.coverMediaId)?.url)
  ok('صفحه عمومی از همان گالری و کاور مدیریت‌شده تغذیه می‌شود')

  await deletePlacePhoto(placeId, rows[1]!.id, actor)
  record = (await db.select().from(place).where(eq(place.id, placeId)).limit(1))[0]
  assert.equal(record!.coverMediaId, rows[0]!.mediaId)
  assert.equal((await db.select().from(placePhoto).where(eq(placePhoto.placeId, placeId))).length, 1)
  ok('حذف کاور، تصویر باقی‌مانده را بدون ارجاع یتیم جایگزین می‌کند')
} finally {
  if (placeId) await db.delete(place).where(eq(place.id, placeId))
  await db.delete(auditLog).where(eq(auditLog.actorUserId, actor.userId))
  await closeDb()
}
