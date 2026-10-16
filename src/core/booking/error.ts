/** Do not reflect driver/SQL errors or internal stack details into private forms. */
export function publicBookingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const message = error.message.trim()
  return message.length > 0 && message.length <= 200 && /^[\u0600-\u06ff]/.test(message) ? message : fallback
}
