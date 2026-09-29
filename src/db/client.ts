import 'server-only'

/**
 * دیتابیس، برای کدِ سمت سرورِ اپ.
 *
 * تنها کاری که این فایل می‌کند اضافه‌کردن گاردِ `server-only` روی
 * `connection.ts` است: اگر کسی اشتباهی دیتابیس را در یک client component
 * import کند، build می‌شکند — نه اینکه رشته‌ی اتصال با رمز به بسته‌ی مرورگر
 * برود. اسکریپت‌های CLI مستقیم از `connection.ts` استفاده می‌کنند چون
 * `server-only` در اجرای مستقیم Node می‌ترکد.
 */

export { closeDb, getDb, getPool, pingDb, schema, withDbTransaction, afterDbCommit, inDbTransaction, type Db } from './connection'
