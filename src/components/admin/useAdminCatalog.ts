'use client'
import { useEffect, useState } from 'react'

export function useAdminCatalog<T>(type: 'places' | 'users', initialRows: T[], initialTotal: number, enabled: boolean) {
  const [rows, setRows] = useState(initialRows), [total, setTotal] = useState(initialTotal)
  const [query, updateQuery] = useState(''), [page, updatePage] = useState(1)
  const [filters, updateFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [version, setVersion] = useState(0)
  const prefix = type === 'places' ? 'place' : 'user'
  useEffect(() => {
    const read = () => {
      const p = new URL(location.href).searchParams
      updateQuery((p.get(`${prefix}Q`) ?? '').slice(0, 120)); updatePage(Math.max(1, Number(p.get(`${prefix}Page`)) || 1))
      const keys = type === 'places' ? ['status', 'district', 'health'] : ['role']
      updateFilters(Object.fromEntries(keys.map(key => [key, p.get(`${prefix}-${key}`) ?? (key === 'health' ? p.get('health') ?? '' : '')])))
    }
    read(); window.addEventListener('popstate', read)
    const changed = (event: Event) => { if ((event as CustomEvent<{ ok: boolean }>).detail.ok) setVersion(value => value + 1) }
    document.addEventListener('managed-form-result', changed)
    return () => { window.removeEventListener('popstate', read); document.removeEventListener('managed-form-result', changed) }
  }, [prefix, type])
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      const p = new URLSearchParams({ type, q: query, page: String(page), ...filters })
      const url = new URL(location.href); url.searchParams.set(`${prefix}Q`, query); url.searchParams.set(`${prefix}Page`, String(page))
      for (const [key, value] of Object.entries(filters)) { if (value) url.searchParams.set(`${prefix}-${key}`, value); else url.searchParams.delete(`${prefix}-${key}`) }
      history.replaceState(history.state, '', url)
      try {
        const response = await fetch(`/api/admin/catalog?${p}`, { signal: controller.signal, cache: 'no-store' })
        const result = await response.json() as { rows?: T[]; total?: number; page?: number; error?: string }
        if (!response.ok || !Array.isArray(result.rows)) throw new Error(result.error || 'دریافت فهرست انجام نشد.')
        if (!controller.signal.aborted) { setRows(result.rows); setTotal(result.total ?? 0); if (result.page && result.page !== page) updatePage(result.page) }
      } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'ارتباط با سرور برقرار نشد.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [enabled, type, query, page, filters, prefix, version])
  const setQuery = (value: string) => { updateQuery(value); updatePage(1) }
  const setFilter = (key: string, value: string) => { updateFilters(current => ({ ...current, [key]: value })); updatePage(1) }
  return { rows, total, query, setQuery, page, setPage: updatePage, filters, setFilter, loading, error, retry: () => setVersion(value => value + 1) }
}
