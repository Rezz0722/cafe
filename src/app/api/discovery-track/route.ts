import { cookies } from 'next/headers'
import { detectDevice, VISITOR_COOKIE } from '@/core/analytics/track'
import { parseHomeDiscoveryEvent } from '@/core/discovery/tracking'
import { getSettings } from '@/core/settings/store'
import { getDb } from '@/db/client'
import { searchLog } from '@/db/schema'

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin') return new Response(null, { status: 204 })
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (origin) {
    try { if (!host || new URL(origin).host !== host) return new Response(null, { status: 204 }) }
    catch { return new Response(null, { status: 204 }) }
  }
  if (detectDevice(request.headers.get('user-agent')) === 'bot') return new Response(null, { status: 204 })
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 512) return new Response(null, { status: 204 })
  let payload: unknown
  try { payload = await request.json() } catch { return new Response(null, { status: 204 }) }
  const event = parseHomeDiscoveryEvent(payload)
  if (!event || !(await getSettings()).trackPageViews) return new Response(null, { status: 204 })
  const store = await cookies()
  const visitor = store.get(VISITOR_COOKIE)?.value
  try {
    await getDb().insert(searchLog).values({
      query: '',
      requestedScope: 'places',
      resolvedEntity: 'places',
      resolvedIntent: `home:${event.event}:${event.source}:${event.placeId ? '' : event.context}`.slice(0, 80),
      facetIds: '',
      resultCount: 0,
      clickedPlaceId: event.placeId,
      sessionId: visitor && /^[a-f0-9-]{36}$/i.test(visitor) ? visitor : null,
    })
  } catch (error) {
    console.warn('[discovery-track] failed', error)
  }
  return new Response(null, { status: 204 })
}
