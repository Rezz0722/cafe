export type SearchSuggestion = {
  type: 'place' | 'item' | 'dish' | 'facet' | 'district'
  label: string
  meta: string
  href: string
}
