import type { Config } from 'drizzle-kit'

/**
 * پیکربندی drizzle-kit برای MySQL.
 *
 *   npm run db:push       — شما را روی دیتابیس اعمال می‌کند (توسعه)
 *   npm run db:generate   — فایل SQL مهاجرت می‌سازد (تولید)
 *
 * بعد از هر بار ساختن جداول، `drizzle/mysql-extras.sql` را هم اجرا کنید:
 * ایندکس‌های FULLTEXT که drizzle-kit تولید نمی‌کند.
 */
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'mysql://cafegard:cafegard_local_2026@127.0.0.1:3306/cafegard',
  },
} satisfies Config
