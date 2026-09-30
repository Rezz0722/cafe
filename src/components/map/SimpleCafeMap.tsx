'use client'

// An on-demand, WebGL-free renderer of the same local OSM data. No third-party
// tile server, coordinates, worker or access token is involved in this fallback.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { CafeMapProps, MapPlace } from './CafeMap'
import styles from './SimpleCafeMap.module.css'
import { useTheme } from '@/components/theme/ThemeProvider'

export function SimpleCafeMap({ places, labels = [], userLocation, focusSlug, center, zoom,
  minZoom = 9, maxZoom = 18.5, height = '420px', theme: requestedTheme, onSelect,
  className, showLocate = true, cluster = true, alwaysLabel = false,
  linkBase = '/cafe/', stateStorageKey }: CafeMapProps) {
  const { resolvedTheme } = useTheme()
  const theme = requestedTheme ?? resolvedTheme
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [locationError, setLocationError] = useState('')
  const initial = useRef({ center, zoom, minZoom, maxZoom, stateStorageKey })
  const valid = useMemo(() => places.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= 36 && p.lat <= 36.67 && p.lng >= 59.05 && p.lng <= 60), [places])

  useEffect(() => {
    if (!container.current) return
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), 15000)
    const options = initial.current
    let restored: { lat: number; lng: number; zoom: number } | null = null
    try {
      const value = JSON.parse(sessionStorage.getItem(options.stateStorageKey ?? '') ?? 'null')
      if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng) && Number.isFinite(value.zoom)
        && value.lat >= 36 && value.lat <= 36.67 && value.lng >= 59.05 && value.lng <= 60
        && value.zoom >= minZoom && value.zoom <= maxZoom) restored = value
    } catch { /* Storage is optional. */ }
    const position = restored ?? options.center ?? (valid.length === 1 ? valid[0]! : { lat: 36.2972, lng: 59.6067 })
    const map = L.map(container.current, { preferCanvas: true, zoomControl: false,
      minZoom, maxZoom, maxBounds: [[36, 59.05], [36.67, 60]],
      scrollWheelZoom: false, attributionControl: true,
    }).setView([position.lat, position.lng], restored?.zoom ?? options.zoom ?? (valid.length === 1 ? 16 : 12))
    mapRef.current = map
    const updateZoom = () => { if (container.current?.parentElement) container.current.parentElement.dataset.mapZoom = String(map.getZoom()) }
    updateZoom(); map.on('zoomend', updateZoom)
    map.attributionControl.setPrefix(false)
    map.attributionControl.addAttribution('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>')
    L.control.zoom({ position: 'topleft', zoomInTitle: 'بزرگ‌نمایی', zoomOutTitle: 'کوچک‌نمایی' }).addTo(map)
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map)
    if (!restored && !options.center && valid.length > 1) map.fitBounds(L.latLngBounds(valid.map(p => [p.lat, p.lng])), { padding: [48, 48], maxZoom: 15 })
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }))
    resize.observe(container.current)
    map.on('moveend', () => {
      if (!options.stateStorageKey) return
      const at = map.getCenter()
      try { sessionStorage.setItem(options.stateStorageKey, JSON.stringify({ lat: at.lat, lng: at.lng, zoom: map.getZoom() })) } catch { /* optional */ }
    })
    setReady(true); setLoading(true); setError('')
    const layers = [
      { name: 'water', order: 210, color: theme === 'dark' ? '#234858' : '#bfdfec', fill: true, weight: 0 },
      { name: 'green', order: 220, color: theme === 'dark' ? '#27463a' : '#cddfca', fill: true, weight: 0 },
      { name: 'road_mid', order: 230, color: theme === 'dark' ? '#6c737e' : '#ffffff', fill: false, weight: 3 },
      { name: 'road_major', order: 240, color: theme === 'dark' ? '#9a916f' : '#dbb975', fill: false, weight: 5 },
    ]
    void Promise.allSettled(layers.map(async layer => {
      const pane = map.createPane(layer.name); pane.style.zIndex = String(layer.order)
      const response = await fetch(`/map/${layer.name}.geojson`, { signal: abort.signal })
      if (!response.ok) throw new Error(String(response.status))
      const data = await response.json()
      if (abort.signal.aborted) return
      L.geoJSON(data, { pane: layer.name, interactive: false,
        style: { color: layer.color, fillColor: layer.color, fillOpacity: 1, opacity: 1, weight: layer.weight },
      }).addTo(map)
    })).then(results => {
      if (mapRef.current !== map) return
      clearTimeout(timer); setLoading(false)
      if (results.some(result => result.status === 'rejected')) setError('بخشی از جزئیات نقشه بار نشد؛ موقعیت مجموعه‌ها در دسترس است.')
    })
    return () => { abort.abort(); clearTimeout(timer); resize.disconnect(); mapRef.current = null; map.remove() }
    // Initial viewport is deliberately retained across result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, attempt])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const group = L.layerGroup().addTo(map)
    const render = () => {
      group.clearLayers()
      const names = alwaysLabel || map.getZoom() >= 14.5
      const grid = new Map<string, MapPlace[]>()
      for (const place of valid) {
        const pixel = map.latLngToContainerPoint([place.lat, place.lng])
        const key = !cluster || names ? String(place.id) : `${Math.floor(pixel.x / 64)}:${Math.floor(pixel.y / 64)}`
        grid.set(key, [...(grid.get(key) ?? []), place])
      }
      for (const entries of grid.values()) {
        const first = entries[0]!
        const lat = entries.reduce((sum, p) => sum + p.lat, 0) / entries.length
        const lng = entries.reduce((sum, p) => sum + p.lng, 0) / entries.length
        const element = document.createElement(entries.length > 1 ? 'button' : 'a')
        element.setAttribute('data-map-pin', '')
        if (entries.length > 1) {
          const button = element as HTMLButtonElement; button.type = 'button'
          button.className = styles.cluster
          button.textContent = entries.length.toLocaleString('fa-IR')
          button.setAttribute('aria-label', `${entries.length} مجموعه؛ برای دیدن بزرگ کنید`)
          button.onclick = () => map.setView([lat, lng], Math.min(map.getZoom() + 2, maxZoom))
        } else {
          const link = element as HTMLAnchorElement; link.href = `${linkBase}${encodeURIComponent(first.slug)}`
          link.className = `${styles.pin} ${first.slug === focusSlug ? styles.focus : ''}`
          link.setAttribute('aria-label', first.note ? `${first.name} — ${first.note}` : first.name)
          const dot = document.createElement('span'); dot.className = styles.dot; dot.textContent = '●'; dot.setAttribute('aria-hidden', 'true'); link.append(dot)
          if (names) {
            const label = document.createElement('span'); label.className = styles.name; label.textContent = first.name; link.append(label)
            if (first.note) { const note = document.createElement('small'); note.textContent = first.note; link.append(note) }
          }
          if (onSelect) link.onclick = event => { event.preventDefault(); onSelect(first) }
        }
        L.marker([lat, lng], { keyboard: false, icon: L.divIcon({ html: element,
          className: styles.marker, iconSize: [44, 44], iconAnchor: [22, 44] }) }).addTo(group)
      }
    }
    render(); map.on('moveend zoomend', render)
    return () => { map.off('moveend zoomend', render); group.remove() }
  }, [valid, ready, attempt, theme, cluster, alwaysLabel, onSelect, focusSlug, linkBase, maxZoom])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const group = L.layerGroup().addTo(map)
    for (const label of labels) {
      if (!Number.isFinite(label.lat) || !Number.isFinite(label.lng)) continue
      const element = document.createElement('span'); element.className = styles.landmark; element.textContent = label.name
      L.marker([label.lat, label.lng], { interactive: false, keyboard: false, icon: L.divIcon({ html: element, className: styles.marker, iconSize: [100, 20], iconAnchor: [50, 10] }), zIndexOffset: -500 }).addTo(group)
    }
    if (userLocation && Number.isFinite(userLocation.lat) && Number.isFinite(userLocation.lng))
      L.circleMarker([userLocation.lat, userLocation.lng], { radius: 8, color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }).addTo(group)
    return () => { group.remove() }
  }, [labels, userLocation, ready, attempt, theme])

  const locate = () => {
    if (!navigator.geolocation) { setLocationError('مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند.'); return }
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude: lat, longitude: lng } = position.coords
      if (lat < 36 || lat > 36.67 || lng < 59.05 || lng > 60) { setLocationError('موقعیت شما خارج از محدودهٔ نقشهٔ مشهد است.'); return }
      setLocationError(''); mapRef.current?.setView([lat, lng], 15)
    }, () => setLocationError('موقعیت دریافت نشد؛ می‌توانید نقشه را دستی جابه‌جا کنید.'), { timeout: 8000, maximumAge: 60000 })
  }
  return <div className={`${styles.wrap} ${className ?? ''}`} style={{ height }} data-theme={theme} data-map-renderer="2d">
    <div ref={container} className={styles.canvas} aria-label="نقشهٔ موقعیت مجموعه‌ها" />
    {loading && <span className={styles.status} role="status">بارگذاری جزئیات نقشه…</span>}
    {error && <div className={styles.status} role="status">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button></div>}
    {locationError && <div className={styles.status} role="status">{locationError} <button type="button" aria-label="بستن پیام" onClick={() => setLocationError('')}>×</button></div>}
    {showLocate && <button className={styles.locate} type="button" onClick={locate}>موقعیت من</button>}
    {!valid.length && <span className={styles.empty}>در این نتیجه مجموعه‌ای با مختصات معتبر وجود ندارد.</span>}
  </div>
}
