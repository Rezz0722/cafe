import 'server-only'
import { getDb } from '@/db/client'
import { searchLog } from '@/db/schema'
import type { HomeDiscoveryEvent } from './tracking'

/** Reuse the existing anonymous analytics table; no raw query or PII. */
export async function recordHomeDiscoveryEvent(event: HomeDiscoveryEvent, sessionId: string | null): Promise<number> {
  const [result] = await getDb().insert(searchLog).values({
    query: '',
    requestedScope: 'places',
    resolvedEntity: 'places',
    resolvedIntent: `home:${event.event}:${event.source}:${event.placeId ? '' : event.context}`.slice(0, 80),
    facetIds: '',
    resultCount: 0,
    clickedPlaceId: event.placeId,
    sessionId,
  })
  return result.insertId
}
