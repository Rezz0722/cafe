import 'server-only'

import { getZeroResultSearches } from './stats'
import { createInsightCache } from './insightCache'

// All-history aggregation stays unchanged. The snapshot is shared only after
// per-request authorization; nothing is cached in the browser or public CDN.
export const getSearchInsights = createInsightCache(() => getZeroResultSearches(20), 60_000)
