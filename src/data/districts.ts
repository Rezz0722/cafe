import type { District } from '@/core/places/types'

/**
 * محله‌های مشهد.
 *
 * مختصات، **مرکز تقریبی محله** است نه موقعیت دقیق کافه‌ها. فایل ورودی
 * (`Mashhad_Cafes_Database.json`) هیچ مختصاتی ندارد، پس هر کافه فعلاً مختصات
 * مرکز محله‌اش را می‌گیرد و در provenance با منبع `inferred` و اطمینان پایین
 * ثبت می‌شود.
 *
 * یعنی «نزدیک‌ترین» در سطح محله درست کار می‌کند ولی در سطح خیابان نه. تنها
 * راه درست‌کردنش، ثبت مختصات واقعی در بازدید میدانی است.
 *
 * طرقبه و شاندیز شهرهای جدا در غرب مشهدند، ولی چون مقصد همیشگی کافه‌گردی
 * مشهدی‌ها هستند اینجا به‌عنوان محله نگه داشته شده‌اند.
 */
export const DISTRICTS: District[] = [
  // ── مرکز و غرب ──
  { id: 'sajad', slug: 'sajad', name: 'سجاد', center: { lat: 36.3157, lng: 59.5391 } },
  { id: 'ahmadabad', slug: 'ahmadabad', name: 'احمدآباد', center: { lat: 36.2977, lng: 59.5895 } },
  { id: 'kuhsangi', slug: 'kuhsangi', name: 'کوه‌سنگی', center: { lat: 36.2856, lng: 59.5836 } },
  { id: 'vakilabad', slug: 'vakilabad', name: 'وکیل‌آباد', center: { lat: 36.3298, lng: 59.479 } },
  { id: 'rahnamaei', slug: 'rahnamaei', name: 'راهنمایی', center: { lat: 36.307, lng: 59.5666 } },
  { id: 'ghasemabad', slug: 'ghasemabad', name: 'قاسم‌آباد', center: { lat: 36.355, lng: 59.465 } },
  { id: 'hashemieh', slug: 'hashemieh', name: 'هاشمیه', center: { lat: 36.33, lng: 59.51 } },
  { id: 'malekabad', slug: 'malekabad', name: 'ملک‌آباد', center: { lat: 36.305, lng: 59.555 } },
  { id: 'faramarz', slug: 'faramarz-abbasi', name: 'فرامرز عباسی', center: { lat: 36.325, lng: 59.525 } },
  { id: 'kowsar', slug: 'kowsar', name: 'کوثر', center: { lat: 36.335, lng: 59.5 } },
  { id: 'daneshjou', slug: 'daneshjou', name: 'دانشجو', center: { lat: 36.32, lng: 59.53 } },
  { id: 'emamat', slug: 'emamat', name: 'امامت', center: { lat: 36.335, lng: 59.515 } },
  { id: 'haft-tir', slug: 'haft-tir', name: 'هفت تیر', center: { lat: 36.315, lng: 59.545 } },
  { id: 'mollasadra', slug: 'mollasadra', name: 'ملاصدرا', center: { lat: 36.32, lng: 59.54 } },
  { id: 'azadi', slug: 'azadi', name: 'میدان آزادی', center: { lat: 36.317, lng: 59.521 } },
  { id: 'namaz', slug: 'namaz', name: 'نماز', center: { lat: 36.31, lng: 59.55 } },
  { id: 'daneshgah', slug: 'daneshgah', name: 'دانشگاه', center: { lat: 36.3, lng: 59.53 } },

  // ── شرق و اطراف حرم ──
  { id: 'emam-reza', slug: 'emam-reza', name: 'امام رضا', center: { lat: 36.288, lng: 59.61 } },
  { id: 'haram', slug: 'haram', name: 'حرم مطهر', center: { lat: 36.288, lng: 59.6157 } },
  { id: 'arg', slug: 'arg', name: 'ارگ', center: { lat: 36.287, lng: 59.605 } },
  { id: 'shirazi', slug: 'shirazi', name: 'شیرازی', center: { lat: 36.289, lng: 59.612 } },
  { id: 'khayyam', slug: 'khayyam', name: 'خیام', center: { lat: 36.31, lng: 59.575 } },
  { id: 'janbaz', slug: 'janbaz', name: 'جانباز', center: { lat: 36.295, lng: 59.595 } },
  { id: 'farhad', slug: 'farhad', name: 'فرهاد', center: { lat: 36.3, lng: 59.58 } },
  { id: 'pirouzi', slug: 'pirouzi', name: 'پیروزی', center: { lat: 36.29, lng: 59.55 } },
  { id: 'rahahan', slug: 'rah-ahan', name: 'راه آهن', center: { lat: 36.302, lng: 59.568 } },
  { id: 'forudgah', slug: 'forudgah', name: 'فرودگاه', center: { lat: 36.235, lng: 59.641 } },

  // ── شهرهای همجوار غرب ──
  { id: 'torghabeh', slug: 'torghabeh', name: 'طرقبه', center: { lat: 36.3167, lng: 59.3833 } },
  { id: 'shandiz', slug: 'shandiz', name: 'شاندیز', center: { lat: 36.3833, lng: 59.3167 } },
]

export const DISTRICT_BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]))
