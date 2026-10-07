export type MenuView = { kind: 'section' | 'item'; placeId: number; targetId: number; eventId: string }
export const MENU_VIEW_WINDOW = 30 * 60_000
export function parseMenuView(raw: unknown): MenuView | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  if (!['section', 'item'].includes(String(value.kind)) || typeof value.eventId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.eventId)) return null
  for (const key of ['placeId', 'targetId']) if (typeof value[key] !== 'number' || !Number.isSafeInteger(value[key]) || Number(value[key]) < 1 || Number(value[key]) > 2147483647) return null
  return { kind: value.kind as MenuView['kind'], placeId: Number(value.placeId), targetId: Number(value.targetId), eventId: value.eventId }
}
export function menuRequestCountable(headers: Headers, origin: string) {
  const ua = headers.get('user-agent') || ''
  return headers.get('origin') === origin && headers.get('content-type')?.split(';')[0]?.trim() === 'application/json'
    && headers.get('dnt') !== '1' && headers.get('sec-gpc') !== '1' && !!ua
    && !/bot|crawler|spider|crawl|slurp|preview|headless|curl|wget|python/i.test(ua)
    && !/prefetch|prerender/i.test(`${headers.get('purpose') || ''} ${headers.get('sec-purpose') || ''}`)
}
/** Process-local retry suppression/write ceiling, not unique users or distributed anti-fraud. */
export class MenuViewGate {
  private seen = new Map<string, number>()
  private minute = -1
  private writes = 0
  accept(view: MenuView, now = Date.now()) {
    const minute = Math.floor(now / 60_000)
    if (minute !== this.minute) { this.minute = minute; this.writes = 0 }
    const key = `${view.placeId}:${view.kind}:${view.targetId}:${view.eventId}`
    if ((this.seen.get(key) || 0) > now || this.writes >= 600) return false
    for (const [id, expiry] of this.seen) if (expiry <= now) this.seen.delete(id)
    if (this.seen.size >= 5000) this.seen.delete(this.seen.keys().next().value!)
    this.seen.set(key, now + MENU_VIEW_WINDOW); this.writes++
    return true
  }
}
