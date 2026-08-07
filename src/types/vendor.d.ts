

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
