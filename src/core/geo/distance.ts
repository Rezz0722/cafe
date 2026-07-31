/**
 * فاصله‌ی جغرافیایی.
 *
 * در نسخه‌ی قبلی `distanceKm` یک عدد ثابت داخل داده بود، یعنی سورت
 * «نزدیک‌ترین» هیچ ربطی به موقعیت کاربر نداشت. فاصله یک مقدار *مشتق* است و
 * هرگز نباید ذخیره شود.
 *
 * روی Postgres این محاسبه به PostGIS سپرده می‌شود
 * (`ST_Distance(geog, ST_MakePoint(...)::geography)`) که هم دقیق‌تر است و هم
 * با ایندکس GiST سریع. این پیاده‌سازی برای مسیر seed و محاسبات سمت اپلیکیشن
 * است؛ در مقیاس یک شهر تفاوت هاورساین با فاصله‌ی ژئودزیک ناچیز است.
 */

import type { Coords } from '@/core/places/types'

const EARTH_RADIUS_KM = 6371

const toRad = (deg: number) => (deg * Math.PI) / 180

/** فاصله‌ی هاورساین بین دو نقطه، بر حسب کیلومتر. */
export function distanceKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** مرکز مشهد — مبدأ پیش‌فرض وقتی موقعیت کاربر را نداریم. */
export const MASHHAD_CENTER: Coords = { lat: 36.2972, lng: 59.6067 }

/**
 * آیا دو مکان آن‌قدر نزدیک‌اند که کاندید تکراری‌بودن باشند؟
 * قدم اول dedupe (بخش ۳ سند): block کردن بر اساس نزدیکی، قبل از مقایسه‌ی نام.
 */
export function isWithinDedupeRadius(a: Coords, b: Coords, meters = 150): boolean {
  return distanceKm(a, b) * 1000 <= meters
}
