/**
 * تعریف تایپ برای بسته‌هایی که تایپ رسمی ندارند.
 *
 * `geojson-vt` و `vt-pbf` هر دو جاوااسکریپت خالص‌اند و `@types/*` منتشرشده
 * ندارند. تایپ حداقلی اینجا نوشته شده — فقط همان بخشی که استفاده می‌کنیم —
 * تا `any` در کد پخش نشود و امضای واقعی توابع مستند بماند.
 */

declare module 'geojson-vt' {
  interface GeojsonVtOptions {
    maxZoom?: number
    indexMaxZoom?: number
    indexMaxPoints?: number
    tolerance?: number
    extent?: number
    buffer?: number
    lineMetrics?: boolean
    promoteId?: string
    generateId?: boolean
    debug?: number
  }

  interface VtFeature {
    id?: number
    type: number
    geometry: unknown
    tags: Record<string, unknown>
  }

  interface VtTile {
    features: VtFeature[]
    numPoints: number
    numSimplified: number
    numFeatures: number
    source: unknown
    x: number
    y: number
    z: number
    transformed: boolean
    minX: number
    minY: number
    maxX: number
    maxY: number
  }

  interface TileIndex {
    getTile(z: number, x: number, y: number): VtTile | null
    tiles: Record<string, VtTile>
    options: GeojsonVtOptions
  }

  export default function geojsonvt(data: unknown, options?: GeojsonVtOptions): TileIndex
}

declare module 'vt-pbf' {
  interface FromGeojsonVtOptions {
    version?: number
    extent?: number
  }

  /** لایه‌ها را به یک تایل MVT دودویی تبدیل می‌کند. */
  export function fromGeojsonVt(
    layers: Record<string, unknown>,
    options?: FromGeojsonVtOptions,
  ): Uint8Array

  export function fromVectorTileJs(tile: unknown): Uint8Array

  const vtpbf: {
    fromGeojsonVt: typeof fromGeojsonVt
    fromVectorTileJs: typeof fromVectorTileJs
  }
  export default vtpbf
}

declare module 'osm-pbf-parser' {
  import type { Transform } from 'node:stream'

  export interface OsmItem {
    type: 'node' | 'way' | 'relation'
    id: number
    lat?: number
    lon?: number
    tags?: Record<string, string>
    refs?: number[]
    members?: { type: string; ref: number; role: string }[]
  }

  /** جریانِ شیئی که آرایه‌ای از عناصر OSM بیرون می‌دهد. */
  export default function parseOSM(): Transform
}
