/** Confirmed archived nonvenues; these are source IDs, never place IDs. */
export const TOP_MENU_EXCLUSION_POLICY_VERSION = 1
export const TOP_MENU_EXCLUDED_SOURCE_IDS: readonly number[] = Object.freeze([162, 248, 711, 731])

export function isTopMenuSourceExcluded(sourceId: number): boolean {
  return TOP_MENU_EXCLUDED_SOURCE_IDS.includes(sourceId)
}
