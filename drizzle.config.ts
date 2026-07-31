import type { Config } from 'drizzle-kit'

/**
 * پیکربندی drizzle-kit.
 *
 * `npm run db:generate` فایل SQL مهاجرت را از `src/db/schema.ts` می‌سازد.
 * قبل از اجرای مهاجرت، افزونه‌ها و ایندکس‌های PostGIS را دستی اضافه کنید —
 * جزئیات در docs/DATA_LAYER.md.
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/cafegard',
  },
} satisfies Config
