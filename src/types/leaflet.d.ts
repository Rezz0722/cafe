/** Narrow, typed contract for our on-demand Leaflet 1.9.4 adapter.
 * API reference: https://leafletjs.com/reference.html
 * Keep this surface limited to the APIs actually used by SimpleCafeMap.
 */
declare module 'leaflet' {
  import type { GeoJsonObject } from 'geojson'
  export type LatLngTuple = [number, number]
  export interface LatLng { lat: number; lng: number }
  export interface Point { x: number; y: number }
  export interface Layer { addTo(map: Map | LayerGroup): this; remove(): this }
  export interface LayerGroup extends Layer { clearLayers(): this }
  export interface Icon {}
  export interface Bounds {}
  export interface Map {
    setView(position: LatLngTuple, zoom: number): this
    fitBounds(bounds: Bounds, options: { padding: [number, number]; maxZoom: number }): this
    getCenter(): LatLng
    getZoom(): number
    latLngToContainerPoint(position: LatLngTuple): Point
    createPane(name: string): HTMLElement
    on(events: string, callback: () => void): this
    off(events: string, callback: () => void): this
    invalidateSize(options: { pan: boolean }): this
    remove(): this
    attributionControl: { setPrefix(value: false | string): unknown; addAttribution(value: string): unknown }
  }
  export function map(container: HTMLElement, options: {
    preferCanvas: boolean; zoomControl: boolean; minZoom: number; maxZoom: number;
    maxBounds: [LatLngTuple, LatLngTuple]; scrollWheelZoom: boolean; attributionControl: boolean;
  }): Map
  export function latLngBounds(positions: LatLngTuple[]): Bounds
  export function layerGroup(): LayerGroup
  export function divIcon(options: { html: HTMLElement; className: string; iconSize: [number, number]; iconAnchor: [number, number] }): Icon
  export function marker(position: LatLngTuple, options: { keyboard: boolean; icon: Icon; interactive?: boolean; zIndexOffset?: number }): Layer
  export function circleMarker(position: LatLngTuple, options: { radius: number; color: string; fillColor: string; fillOpacity: number; weight: number }): Layer
  export function geoJSON(data: GeoJsonObject, options: { pane: string; interactive: boolean; style: {
    color: string; fillColor: string; fillOpacity: number; opacity: number; weight: number;
  } }): Layer
  export const control: {
    zoom(options: { position: 'topleft'; zoomInTitle: string; zoomOutTitle: string }): Layer
    scale(options: { imperial: boolean; position: 'bottomleft' }): Layer
  }
}
