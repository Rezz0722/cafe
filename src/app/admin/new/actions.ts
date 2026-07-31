'use server'

import { revalidatePath } from 'next/cache'
import type { AttributeValue, DataSource, PlaceKind, PriceTier } from '@/core/places/types'
import {
  buildPlace,
  findDuplicateCandidates,
  validateNewPlace,
  type NewPlaceInput,
} from '@/core/places/createPlace'
import { appendCustomPlace, readAllPlaces } from '@/data/placeStore'
import { ATTRIBUTES } from '@/core/taxonomy/attributes'
import { paths } from '@/routes'
import type { CreatePlaceState } from './state'

const KINDS: PlaceKind[] = ['cafe', 'cafe_restaurant', 'restaurant']
const SOURCES: DataSource[] = ['field_visit', 'owner', 'instagram', 'user', 'inferred']

function str(form: FormData, key: string): string {
  const v = form.get(key)
  return typeof v === 'string' ? v : ''
}

/**
 * ثبت کافه‌ی جدید.
 *
 * سه لایه‌ی دفاع، به این ترتیب:
 *   ۱. اعتبارسنجی فیلدها (`validateNewPlace`)
 *   ۲. تشخیص تکراری — متوقف می‌کند و تأیید می‌خواهد، ولی راه عبور دارد
 *   ۳. یکتاسازی slug موقع ساخت
 *
 * لایه‌ی ۲ عمداً *مسدودکننده‌ی قطعی* نیست. دو کافه با نام مشابه در یک محله
 * واقعاً ممکن است (شعبه‌ی دوم). تصمیم با آدم است، ولی باید آگاهانه باشد.
 */
export async function createPlaceAction(
  _prev: CreatePlaceState,
  form: FormData,
): Promise<CreatePlaceState> {
  const kindRaw = str(form, 'kind')
  const sourceRaw = str(form, 'source')
  const tierRaw = Number(str(form, 'priceTier'))

  // درجه‌ی هر ویژگی از فیلدهای attr_<id> خوانده می‌شود؛ فقط مقادیر >۰ ثبت.
  const attributes: Record<string, AttributeValue> = {}
  for (const attr of ATTRIBUTES) {
    const raw = Number(str(form, `attr_${attr.id}`))
    if (raw === 1 || raw === 2) attributes[attr.id] = raw as AttributeValue
  }

  const input: NewPlaceInput = {
    name: str(form, 'name'),
    nameEn: str(form, 'nameEn'),
    districtId: str(form, 'districtId'),
    address: str(form, 'address'),
    kind: (KINDS.includes(kindRaw as PlaceKind) ? kindRaw : 'cafe') as PlaceKind,
    priceTier: ([1, 2, 3].includes(tierRaw) ? tierRaw : 2) as PriceTier,
    phone: str(form, 'phone'),
    instagram: str(form, 'instagram'),
    description: str(form, 'description'),
    signatureItem: str(form, 'signatureItem'),
    attributes,
    highlights: str(form, 'highlights')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
    source: (SOURCES.includes(sourceRaw as DataSource)
      ? sourceRaw
      : 'field_visit') as DataSource,
    opensAt: str(form, 'opensAt'),
    closesAt: str(form, 'closesAt'),
  }

  const errors = validateNewPlace(input)
  if (errors.length) return { ok: false, errors, duplicates: [] }

  const existing = await readAllPlaces()

  // ── تشخیص تکراری ──
  if (str(form, 'confirmDuplicate') !== '1') {
    const duplicates = findDuplicateCandidates(input.name, input.districtId, existing)
    if (duplicates.length) return { ok: false, errors: [], duplicates }
  }

  const taken = new Set(existing.map((p) => p.slug))
  const place = buildPlace(input, { slugTaken: (s) => taken.has(s) })

  try {
    await appendCustomPlace(place)
  } catch (err) {
    return {
      ok: false,
      duplicates: [],
      errors: [
        {
          field: 'form',
          message:
            'ذخیره‌سازی روی فایل ناموفق بود. اگر روی محیط serverless اجرا می‌کنید، فایل‌سیستم فقط‌خواندنی است — به Postgres سوئیچ کنید (docs/DATA_LAYER.md).',
        },
      ],
    }
  }

  // صفحات استاتیکی که این کافه باید در آن‌ها ظاهر شود، بازتولید می‌شوند.
  revalidatePath(paths.home)
  revalidatePath(paths.search)
  revalidatePath('/mashhad', 'layout')
  revalidatePath(paths.cafe(place.slug))
  revalidatePath('/sitemap.xml')

  return {
    ok: true,
    errors: [],
    duplicates: [],
    createdSlug: place.slug,
    createdName: place.name,
  }
}
