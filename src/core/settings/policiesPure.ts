/**
 * نگاشتِ خالصِ «تنظیمات → سیاست».
 *
 * ═══ چرا جدا از `policies.ts` ═══
 *
 * `policies.ts` با `import 'server-only'` شروع می‌شود و دیتابیس می‌خواند. این
 * فایل هیچ‌کدام را نمی‌کند: فقط یک شیء `Settings` می‌گیرد و شکل دیگری از آن
 * می‌سازد. جداکردنش یعنی این نگاشت — که دقیقاً همان‌جایی است که یک اشتباهِ
 * کوچک (ضرب در ۶۰ به‌جای ۸۶۴۰۰) بی‌صدا رد می‌شود — **مستقیم قابل تست** است.
 */

import type { LockoutPolicy } from '@/core/auth/password'
import type { OtpPolicy } from '@/core/auth/otpConfig'
import { parsePriceCaps, splitList, type Settings } from './registry'

export interface AuthPolicy {
  otp: OtpPolicy
  lockout: LockoutPolicy
  sessionMaxAgeSec: number
  viewAsMaxAgeSec: number
  passwordMinLength: number
  allowRegistration: boolean
  allowPasswordLogin: boolean
  allowOtpLogin: boolean
  allowSmsVerification: boolean
  registrationRequiresPhoneVerification: boolean
  /** روشن = پیامک ارسال نمی‌شود و کد در لاگ سرور چاپ می‌شود. */
  smsDevMode: boolean
  siteName: string
}

export function authPolicyFrom(s: Settings): AuthPolicy {
  return {
    otp: {
      length: s.otpLength,
      ttlSeconds: s.otpTtlSeconds,
      resendCooldownSeconds: s.otpResendCooldownSeconds,
      maxPerHour: s.otpMaxPerHour,
      maxAttempts: s.otpMaxAttempts,
      maxGlobalPerHour: s.otpMaxGlobalPerHour,
    },
    lockout: { maxAttempts: s.loginMaxAttempts, lockoutMinutes: s.loginLockoutMinutes },
    sessionMaxAgeSec: s.sessionDays * 86_400,
    viewAsMaxAgeSec: s.viewAsMinutes * 60,
    passwordMinLength: s.passwordMinLength,
    allowRegistration: s.allowRegistration,
    allowPasswordLogin: s.allowPasswordLogin,
    allowOtpLogin: s.allowOtpLogin,
    allowSmsVerification: s.allowSmsVerification,
    registrationRequiresPhoneVerification: s.registrationRequiresPhoneVerification,
    smsDevMode: s.smsDevMode,
    siteName: s.siteName,
  }
}

export interface ModerationPolicy {
  reviewsEnabled: boolean
  reviewsRequireApproval: boolean
  reviewMinTextLength: number
  reviewMaxTextLength: number
  ownerRepliesRequireApproval: boolean
  submissionsEnabled: boolean
  /** واژه‌های ممنوع، نرمال‌شده و کوچک‌شده. */
  blocklist: string[]
}

export function moderationPolicyFrom(s: Settings): ModerationPolicy {
  return {
    reviewsEnabled: s.reviewsEnabled,
    reviewsRequireApproval: s.reviewsRequireApproval,
    reviewMinTextLength: s.reviewMinTextLength,
    reviewMaxTextLength: s.reviewMaxTextLength,
    ownerRepliesRequireApproval: s.ownerRepliesRequireApproval,
    submissionsEnabled: s.submissionsEnabled,
    blocklist: splitList(s.reviewBlocklist).map((word) => word.toLowerCase()),
  }
}

export interface DataPolicy {
  priceTierBounds: { cheap: number; mid: number }
  priceStatsMaxItemPrice: number
  priceStatsExcludeServiceSections: boolean
  thousandUnitThreshold: number
  priceOutlierRatio: number
  stalePriceDays: number
  districtMatchMaxKm: number
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  popularFacetMinPlaces: number
  popularDishMinPlaces: number
}

export function dataPolicyFrom(s: Settings): DataPolicy {
  return {
    priceTierBounds: { cheap: s.priceTierCheapMax, mid: s.priceTierMidMax },
    priceStatsMaxItemPrice: s.priceStatsMaxItemPrice,
    priceStatsExcludeServiceSections: s.priceStatsExcludeServiceSections,
    thousandUnitThreshold: s.thousandUnitThreshold,
    priceOutlierRatio: s.priceOutlierRatio,
    stalePriceDays: s.stalePriceDays,
    districtMatchMaxKm: s.districtMatchMaxKm,
    bbox: {
      minLat: s.geoBboxMinLat,
      maxLat: s.geoBboxMaxLat,
      minLng: s.geoBboxMinLng,
      maxLng: s.geoBboxMaxLng,
    },
    popularFacetMinPlaces: s.popularFacetMinPlaces,
    popularDishMinPlaces: s.popularDishMinPlaces,
  }
}

export interface DiscoveryPolicy {
  pageSize: number
  defaultSort: string
  priceCaps: number[]
  ratingPriorCount: number
  defaultSiteMean: number
  nearbyRadiusKm: number
  homeCardCount: number
}

export function discoveryPolicyFrom(s: Settings): DiscoveryPolicy {
  return {
    pageSize: s.searchPageSize,
    defaultSort: s.defaultSort,
    priceCaps: parsePriceCaps(s.priceFilterCaps),
    ratingPriorCount: s.ratingPriorCount,
    defaultSiteMean: s.defaultSiteMean,
    nearbyRadiusKm: s.nearbyRadiusKm,
    homeCardCount: s.homeCardCount,
  }
}

export interface MapPolicy {
  center: { lat: number; lng: number }
  defaultZoom: number
  minZoom: number
  maxZoom: number
  showBuildingsFromZoom: number
  /** شناسه‌ی سرویس‌های مسیریابی، به ترتیب نمایش. */
  routingServices: string[]
}

export function mapPolicyFrom(s: Settings): MapPolicy {
  return {
    center: { lat: s.mapCenterLat, lng: s.mapCenterLng },
    defaultZoom: s.mapDefaultZoom,
    minZoom: s.mapMinZoom,
    maxZoom: s.mapMaxZoom,
    showBuildingsFromZoom: s.showBuildingsFromZoom,
    routingServices: splitList(s.routingServices),
  }
}

export interface LocalePolicy {
  timeZone: string
  cityName: string
  regionName: string
  countryCode: string
  currencyLabel: string
}

export function localePolicyFrom(s: Settings): LocalePolicy {
  return {
    timeZone: s.timeZone,
    cityName: s.cityName,
    regionName: s.regionName,
    countryCode: s.countryCode,
    currencyLabel: s.currencyLabel,
  }
}
