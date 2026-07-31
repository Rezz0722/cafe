import 'server-only'

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Place } from '@/core/places/types'

/**
 * ذخیره‌سازی مکان‌ها روی فایل.
 *
 * دو فایل، عمداً جدا:
 *
 *   places.generated.json  ← خروجی `npm run import:cafes`. بازنویسی می‌شود.
 *   places.custom.json     ← کافه‌های افزوده‌شده از پنل ادمین. دست‌نخورده.
 *
 * اگر یکی بودند، هر بار import کردن، کافه‌هایی که اپراتور دستی اضافه کرده
 * پاک می‌شد — کلاسیک‌ترین راه از دست دادن کارِ دستی.
 *
 * ⚠️  محدودیت: این روش روی یک سرور معمولی (VPS، آروان، لیارا) کار می‌کند ولی
 *     روی محیط‌های serverless با فایل‌سیستم فقط‌خواندنی نه. مسیر درست،
 *     Postgres است (docs/DATA_LAYER.md) — این لایه عمداً پشت همان
 *     `PlaceRepository` است تا جایگزینی‌اش هیچ صفحه‌ای را نشکند.
 */

const DATA_DIR = resolve(process.cwd(), 'src/data')
const GENERATED = resolve(DATA_DIR, 'places.generated.json')
const CUSTOM = resolve(DATA_DIR, 'places.custom.json')

async function readJsonArray(path: string): Promise<Place[]> {
  if (!existsSync(path)) return []
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Place[]) : []
  } catch {
    // فایل خراب نباید کل سایت را پایین بیاورد.
    return []
  }
}

export async function readGeneratedPlaces(): Promise<Place[]> {
  return readJsonArray(GENERATED)
}

export async function readCustomPlaces(): Promise<Place[]> {
  return readJsonArray(CUSTOM)
}

/** همه‌ی مکان‌ها — افزوده‌های دستی بعد از importها می‌آیند. */
export async function readAllPlaces(): Promise<Place[]> {
  const [generated, custom] = await Promise.all([
    readGeneratedPlaces(),
    readCustomPlaces(),
  ])
  return [...generated, ...custom]
}

/** یک مکان جدید به فایل custom اضافه می‌کند. */
export async function appendCustomPlace(place: Place): Promise<void> {
  const existing = await readCustomPlaces()
  await mkdir(dirname(CUSTOM), { recursive: true })
  await writeFile(CUSTOM, `${JSON.stringify([...existing, place], null, 2)}\n`, 'utf8')
}

/** آیا این slug قبلاً استفاده شده؟ — slug باید یکتا باشد. */
export async function slugExists(slug: string): Promise<boolean> {
  const all = await readAllPlaces()
  return all.some((p) => p.slug === slug)
}
