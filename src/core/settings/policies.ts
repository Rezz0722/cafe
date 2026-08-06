import 'server-only'

/**
 * پل بین «تنظیمات» و «سیاست‌های ماژول‌ها».
 *
 * ═══ چرا این فایل وجود دارد ═══
 *
 * ماژول‌های هسته (`otp.ts`، `password.ts`، `openNow.ts`، …) عدد را به‌صورت
 * پارامتر می‌گیرند و هیچ‌کدام از تنظیمات چیزی نمی‌دانند — تا خالص و
 * تست‌شدنی بمانند. اکشن‌ها و صفحه‌ها هم نباید هر بار دستی
 * `{ length: s.otpLength, ttlSeconds: s.otpTtlSeconds, … }` بسازند: آن‌وقت
 * نگاشتِ «تنظیم → سیاست» در ده جا تکرار می‌شود و روزی یکی‌شان جا می‌ماند.
 *
 * پس نگاشت **فقط یک جا** است: `policiesPure.ts`. این فایل همان را با
 * `getSettings()` ترکیب می‌کند. جداسازی برای این است که نگاشت بدون دیتابیس
 * قابل تست بماند.
 */

import { getSettings } from './store'
import {
  authPolicyFrom,
  dataPolicyFrom,
  discoveryPolicyFrom,
  localePolicyFrom,
  mapPolicyFrom,
  moderationPolicyFrom,
  type AuthPolicy,
  type DataPolicy,
  type DiscoveryPolicy,
  type LocalePolicy,
  type MapPolicy,
  type ModerationPolicy,
} from './policiesPure'

export type {
  AuthPolicy,
  DataPolicy,
  DiscoveryPolicy,
  LocalePolicy,
  MapPolicy,
  ModerationPolicy,
}

export {
  authPolicyFrom,
  dataPolicyFrom,
  discoveryPolicyFrom,
  localePolicyFrom,
  mapPolicyFrom,
  moderationPolicyFrom,
}

/**
 * سیاست ورود.
 *
 * `smsDevMode` عمداً بر `AUTH_DEV_MODE` در env **مقدم** است: کسی که پنل ادمین
 * دارد باید بتواند بدون ری‌دیپلوی سایت را از حالت توسعه بیرون بیاورد.
 * پیش‌فرضِ این تنظیم همان پیش‌فرض env است، پس رفتار فعلی عوض نمی‌شود.
 */
export async function getAuthPolicy(): Promise<AuthPolicy> {
  return authPolicyFrom(await getSettings())
}

export async function getModerationPolicy(): Promise<ModerationPolicy> {
  return moderationPolicyFrom(await getSettings())
}

export async function getDataPolicy(): Promise<DataPolicy> {
  return dataPolicyFrom(await getSettings())
}

export async function getDiscoveryPolicy(): Promise<DiscoveryPolicy> {
  return discoveryPolicyFrom(await getSettings())
}

export async function getMapPolicy(): Promise<MapPolicy> {
  return mapPolicyFrom(await getSettings())
}

export async function getLocalePolicy(): Promise<LocalePolicy> {
  return localePolicyFrom(await getSettings())
}
