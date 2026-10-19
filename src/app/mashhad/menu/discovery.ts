export const MENU_ART: Record<string, string> = {
  coffee: '/home/categories/coffee.webp',
  breakfast: '/home/categories/breakfast.webp',
  pasta: '/home/categories/pasta.webp',
  pizza: '/home/categories/pizza.webp',
  main_dish: '/home/categories/main-dish.webp',
  cake_dessert: '/home/categories/dessert.webp',
}

export const FEATURED_MENU_IDS = ['coffee', 'breakfast', 'pasta', 'pizza', 'main_dish', 'cake_dessert'] as const

export const MENU_GROUPS = [
  { kind: 'drink', label: 'قهوه و نوشیدنی' },
  { kind: 'menu', label: 'غذا و خوراکی' },
  { kind: 'cuisine', label: 'غذاهای اصلی و سبک آشپزی' },
  { kind: 'other', label: 'سایر دسته‌ها' },
] as const

export function groupMenuFacets<T extends { id: string; kind: string }>(facets: readonly T[]) {
  const valid = facets.filter(facet => !['addons', 'service'].includes(facet.id))
  return MENU_GROUPS.map(group => ({
    ...group,
    facets: valid.filter(facet => group.kind === 'other'
      ? !['drink', 'menu', 'cuisine'].includes(facet.kind)
      : facet.kind === group.kind),
  })).filter(group => group.facets.length > 0)
}

export const MENU_SORTS = [
  { value: 'rating', label: 'محبوب‌ترین' },
  { value: 'quality', label: 'کامل‌ترین اطلاعات' },
  { value: 'name', label: 'الفبا' },
  { value: 'price_asc', label: 'میانهٔ منو: کم به زیاد' },
  { value: 'price_desc', label: 'میانهٔ منو: زیاد به کم' },
] as const

export function menuSort(value: string | string[] | undefined): typeof MENU_SORTS[number]['value'] {
  return MENU_SORTS.find(sort => sort.value === value)?.value ?? 'rating'
}
