/** Price bracket. Persian labels live in `PRICE_LABELS` (see data/taxonomy.ts). */
export type PriceKey = 'cheap' | 'mid' | 'high'

/** Venue kind — a plain cafe, or one that also serves full meals. */
export type VenueType = 'کافه' | 'کافه‌رستوران'

/** How the result list is ordered. */
export type SortKey = 'rating' | 'near' | 'popular'

/**
 * The tags a venue can be matched on. These double as the "intent" chips the
 * user picks from, which is why they are Persian strings rather than slugs —
 * they are shown verbatim and searched for inside free-text queries.
 */
export type CafeTag = string

export interface Cafe {
  id: string
  name: string
  /** Neighbourhood, e.g. «سجاد». */
  hood: string
  type: VenueType
  rating: number
  /** Number of reviews behind `rating`. */
  reviewCount: number
  priceKey: PriceKey
  /** Straight-line distance from the user, in km. */
  distanceKm: number
  isOpen: boolean
  tags: CafeTag[]
  /** Optional editorial badge shown on the home page cards. */
  ribbon?: string
}

export interface MenuItem {
  id: string
  name: string
  /** Latin name, shown under the Persian one when present. */
  en?: string
  desc?: string
  /** Price in toman. */
  price: number
  /** Percentage off, when the venue is running a promotion. */
  discount?: number | null
  /** Admin-side flag: hidden from the public menu when false. */
  active?: boolean
}

export interface MenuCategory {
  id: string
  name: string
  items: MenuItem[]
}

export interface OpeningHour {
  /** Persian weekday name, starting Saturday. */
  day: string
  from: string
  to: string
  closed: boolean
  /** True when `to` falls after midnight. */
  afterMidnight?: boolean
}

export interface Review {
  id: string
  author: string
  stars: number
  /** Human-readable relative date, e.g. «۳ روز پیش». */
  date: string
  text: string
  /** Reviewer badge, e.g. «کاشف حرفه‌ای». */
  badge?: string
}

/** Everything the detail page needs beyond the list-level `Cafe` record. */
export interface CafeDetail extends Cafe {
  address: string
  openText: string
  openSub: string
  menu: MenuCategory[]
  hours: OpeningHour[]
  reviews: Review[]
  similar: string[]
}

export interface Promotion {
  id: string
  title: string
  desc: string
  /** Validity window as free text, e.g. «تا پایان تیر». */
  range: string
  active: boolean
}

export interface User {
  name: string
}
