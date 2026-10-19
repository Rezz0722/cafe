export interface DiscoveryPage {
  page: number
  total: number
  totalPages: number
  offset: number
  limit: number
}

/** Keep public discovery queries bounded, including malformed and oversized URLs. */
export function getDiscoveryPage(
  requested: string | string[] | undefined,
  total: number,
  pageSize = 12,
): DiscoveryPage {
  const limit = Number.isFinite(pageSize) ? Math.min(48, Math.max(1, Math.floor(pageSize))) : 12
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  const totalPages = Math.max(1, Math.ceil(count / limit))
  const parsed = typeof requested === 'string' && /^[1-9]\d*$/.test(requested) ? Number(requested) : 1
  const page = Math.min(totalPages, Math.max(1, parsed))
  return { page, total: count, totalPages, offset: (page - 1) * limit, limit }
}

/** Page one has a single clean URL; filters and sort survive subsequent pages. */
export function pagePath(
  basePath: string,
  page: number,
  query?: Record<string, string>,
  anchor?: string,
): string {
  const params = new URLSearchParams(query)
  if (Number.isSafeInteger(page) && page > 1) params.set('page', String(page))
  else params.delete('page')
  const search = params.toString()
  const hash = anchor ? `#${encodeURIComponent(anchor.replace(/^#/, ''))}` : ''
  return `${basePath}${search ? `?${search}` : ''}${hash}`
}
