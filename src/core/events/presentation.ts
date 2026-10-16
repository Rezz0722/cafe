import type { EVENT_PARTICIPATION_STATUS, VENUE_EVENT_CATEGORY, VENUE_EVENT_STATUS } from '@/db/schema'
import { bookingDateLabel } from '@/core/booking/presentation'

export const EVENT_CATEGORY_LABEL: Record<(typeof VENUE_EVENT_CATEGORY)[number], string> = {
  music: 'موسیقی', workshop: 'کارگاه', tasting: 'چشیدن و آشنایی', community: 'دورهمی', other: 'سایر',
}
export const EVENT_STATUS_LABEL: Record<(typeof VENUE_EVENT_STATUS)[number], string> = {
  draft: 'پیش‌نویس', published: 'منتشرشده', cancelled: 'لغوشده', ended: 'پایان‌یافته',
}
export const EVENT_PARTICIPATION_LABEL: Record<(typeof EVENT_PARTICIPATION_STATUS)[number], string> = {
  interested: 'علاقه‌مندی ثبت شد', pending: 'در انتظار پاسخ کافه', confirmed: 'تأییدشده توسط کافه',
  rejected: 'ردشده', cancelled: 'لغوشده',
}
export const eventTimeLabel = bookingDateLabel
