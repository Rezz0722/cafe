import type { BOOKING_KIND, BOOKING_STATUS } from '@/db/schema'

export const BOOKING_KIND_LABEL: Record<(typeof BOOKING_KIND)[number], string> = {
  table: 'میز', birthday: 'تولد', gathering: 'دورهمی', special_occasion: 'مناسبت ویژه',
}

export const BOOKING_STATUS_LABEL: Record<(typeof BOOKING_STATUS)[number], string> = {
  pending: 'در انتظار پاسخ کافه', confirmed: 'تأییدشده توسط کافه', rejected: 'ردشده',
  cancelled: 'لغوشده', expired: 'منقضی‌شده', completed: 'انجام‌شده',
}

export function bookingDateLabel(date: string, time: string): string {
  const instant = new Date(`${date}T12:00:00Z`)
  const dateLabel = Number.isFinite(instant.getTime())
    ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(instant)
    : date
  return `${dateLabel}، ساعت ${new Intl.NumberFormat('fa-IR').format(Number(time.slice(0, 2)))}:${new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 }).format(Number(time.slice(3, 5)))}`
}
