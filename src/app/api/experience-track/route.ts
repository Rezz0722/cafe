import { cookies } from 'next/headers'
import { getCurrentUser } from '@/core/auth/currentUser'
import { newVisitorId, VISITOR_COOKIE } from '@/core/analytics/track'
import { isExperienceSlug } from '@/core/experience/registry'
import { getSettings } from '@/core/settings/store'
import { getDb } from '@/db/client'
import { searchLog } from '@/db/schema'

const VISITOR_MAX_AGE = 365 * 24 * 3600

export async function POST(request: Request): Promise<Response> {
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return new Response(null, { status: 204 })
  }

  const experience = typeof payload.experience === 'string' ? payload.experience : ''
  const event = payload.event === 'card_click' || payload.event === 'result_click'
    ? payload.event
    : null
  if (!event || !isExperienceSlug(experience)) return new Response(null, { status: 204 })

  const settings = await getSettings()
  if (!settings.trackPageViews) return new Response(null, { status: 204 })

  const store = await cookies()
  let visitorId = store.get(VISITOR_COOKIE)?.value ?? null
  let isNew = false
  if (!visitorId || visitorId.length !== 36) {
    visitorId = newVisitorId()
    isNew = true
  }
  const user = await getCurrentUser()
  const resultCount = Number(payload.resultCount)
  const placeId = Number(payload.placeId)
  const rank = Number(payload.rank)

  try {
    await getDb().insert(searchLog).values({
      query: '',
      requestedScope: 'places',
      resolvedEntity: 'places',
      resolvedIntent: `experience:${experience}:${event}`,
      facetIds: '',
      resultCount: Number.isSafeInteger(resultCount) && resultCount >= 0 ? resultCount : 0,
      clickedPlaceId: event === 'result_click' && Number.isSafeInteger(placeId) && placeId > 0
        ? placeId
        : null,
      clickedRank: event === 'result_click' && Number.isSafeInteger(rank) && rank > 0
        ? rank
        : null,
      userId: user?.id ?? null,
      sessionId: visitorId,
    })
  } catch (error) {
    console.warn('[experience-track] failed', error)
  }

  const response = new Response(null, { status: 204 })
  if (isNew) {
    response.headers.append(
      'Set-Cookie',
      `${VISITOR_COOKIE}=${visitorId}; Path=/; Max-Age=${VISITOR_MAX_AGE}; HttpOnly; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`,
    )
  }
  return response
}
