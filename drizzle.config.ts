import type { Config } from 'drizzle-kit'
import { ensureEnvLoaded } from './src/core/config/loadEnv'

/**
 * پیکربندی drizzle-kit برای MySQL/MariaDB.
 *
 *   npm run db:generate   — از تغییرِ `schema.ts` فایل SQL مهاجرت می‌سازد
 *   npm run db:migrate    — مهاجرت‌ها را اعمال می‌کند (روی سرور از این استفاده کنید)
 *   npm run db:push       — شما را مستقیم اعمال می‌کند (فقط توسعه‌ی محلی)
 *
 * `db:migrate` و `db:push` خودشان `drizzle/mysql-extras.sql` را هم اجرا
 * می‌کنند: ایندکس‌های FULLTEXT که drizzle-kit تولید نمی‌کند و بدونشان
 * جست‌وجوی نام کافه کار نمی‌کند.
 *
 * ═══ چرا `ensureEnvLoaded` اینجا لازم است ═══
 *
 * Next.js خودش `.env.local` را بار می‌کند، ولی `drizzle-kit` یک ابزار CLI
 * مستقل است و این کار را نمی‌کند. بدون این خط `process.env.DATABASE_URL`
 * خالی می‌ماند.
 *
 * ═══ چرا دیگر fallback به اعتبارنامه‌ی محلی نداریم ═══
 *
 * نسخه‌ی قبلی این بود:
 *
 *     url: process.env.DATABASE_URL ?? 'mysql://cafegard:…@127.0.0.1/cafegard'
 *
 * روی سرور تولید دقیقاً همان اتفاقی افتاد که چنین fallbackی می‌سازد:
 * `DATABASE_URL` بار نشده بود، drizzle-kit بی‌صدا به اعتبارنامه‌ی **ماشین
 * توسعه** برگشت، و مهاجرت با «Access denied for user 'cafegard'» شکست خورد —
 * پیامی که هیچ ربطی به علت واقعی (نبودِ env) نداشت.
 *
 * حالا اگر `DATABASE_URL` نباشد صریح و با پیام مفید می‌ترکد. حالتِ بدترِ آن
 * fallback این بود که روی ماشینی که هم دیتابیس محلی دارد هم تولید، مهاجرت
 * بی‌خبر روی اشتباهی اجرا شود.
 */

ensureEnvLoaded()

const url = process.env.DATABASE_URL?.trim()

if (!url) {
  throw new Error(
    'DATABASE_URL تنظیم نشده است.\n' +
      '  آن را در `.env.local` بگذارید (نمونه‌اش در `.env.example` است)،\n' +
      '  یا موقتاً inline بدهید:  DATABASE_URL=mysql://… npm run db:migrate',
  )
}

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: { url },
} satisfies Config
