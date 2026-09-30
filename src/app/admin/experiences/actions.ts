'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { getSession } from '@/core/auth/currentUser'
import { invalidateReferenceCache } from '@/core/places/queries'
import { patchPlaceAttributes, type AttributePatchInput } from '@/core/places/manage'
import { samePlaceRevision } from '@/core/places/revision'
import { EXPERIENCE_CURATION_ATTRIBUTE_IDS } from '@/core/experience/registry'
import { getDb } from '@/db/client'
import { place as placeTable } from '@/db/schema'
import { paths } from '@/routes'
import { cleanUserText } from '@/core/security/input'
import type { ExperienceCurationState } from './state'

function text(form: FormData, key: string): string {
  const value = form.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function safeFilter(value: string): string {
  return ['all', 'unreviewed', 'partial', 'reviewed', 'stale'].includes(value) ? value : 'all'
}

export async function saveExperienceCurationAction(
  _previous: ExperienceCurationState,
  form: FormData,
): Promise<ExperienceCurationState> {
  const { user, actor } = await getSession()
  if (!user) return { ok: false, error: 'ابتدا وارد شوید.' }
  if (actor || user.role !== 'admin') return { ok: false, error: 'فقط مدیر سیستم به این صف دسترسی دارد.' }

  const placeId = Number(text(form, 'placeId'))
  if (!Number.isSafeInteger(placeId) || placeId <= 0) return { ok: false, error: 'کافه معتبر نیست.' }

  const db = getDb()
  const [place] = await db
    .select({ slug: placeTable.slug, revision: placeTable.revision })
    .from(placeTable)
    .where(eq(placeTable.id, placeId))
    .limit(1)
  if (!place) return { ok: false, error: 'کافه پیدا نشد.' }
  if (!samePlaceRevision(place.revision, text(form, 'revision'))) {
    return { ok: false, error: 'اطلاعات کافه در تب دیگری تغییر کرده است؛ صفحه را تازه کنید.' }
  }

  const inputs: AttributePatchInput[] = EXPERIENCE_CURATION_ATTRIBUTE_IDS.map((attributeId) => {
    const raw = text(form, `attr_${attributeId}`)
    const value = raw === '' ? null : Number(raw)
    return {
      attributeId,
      value: value === 0 || value === 1 || value === 2 ? value : null,
    }
  })
  const source = text(form, 'source') === 'field_visit' ? 'field_visit' : 'editorial'
  const evidenceNote = cleanUserText(text(form, 'evidenceNote'), 500)
  const result = await patchPlaceAttributes(
    placeId,
    inputs,
    { userId: user.id, label: user.name || user.phone || user.id },
    source,
    evidenceNote,
  )
  if (!result.ok) return { ok: false, error: result.error ?? 'ذخیره انجام نشد.' }

  await db.update(placeTable).set({
    revision: sql`${placeTable.revision} + 1`,
    updatedAt: new Date(),
  }).where(eq(placeTable.id, placeId))

  invalidateReferenceCache()
  revalidatePath(paths.home)
  revalidatePath(paths.search)
  revalidatePath(paths.cafe(place.slug))
  revalidatePath('/mashhad/experience', 'layout')
  revalidatePath('/admin/experiences')

  const params = new URLSearchParams()
  const nextPlaceId = Number(text(form, 'nextPlaceId'))
  if (Number.isSafeInteger(nextPlaceId) && nextPlaceId > 0) params.set('place', String(nextPlaceId))
  const status = safeFilter(text(form, 'filterStatus'))
  if (status !== 'all') params.set('status', status)
  const districtId = text(form, 'filterDistrict').slice(0, 48)
  const query = text(form, 'filterQuery').slice(0, 120)
  if (districtId) params.set('district', districtId)
  if (query) params.set('q', query)

  return {
    ok: true,
    message: 'پوشش تجربه‌های این کافه ذخیره شد.',
    navigateTo: `/admin/experiences${params.size ? `?${params.toString()}` : ''}`,
    savedAt: Date.now(),
  }
}
