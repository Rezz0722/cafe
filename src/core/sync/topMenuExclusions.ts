/** Confirmed reviewed nonvenues/demos; these are source IDs, never place IDs. */
export const TOP_MENU_EXCLUSION_POLICY_VERSION = 2
export const TOP_MENU_EXCLUDED_SOURCE_IDS: readonly number[] = Object.freeze([2, 162, 248, 396, 647, 711, 731])

export function isTopMenuSourceExcluded(sourceId: number): boolean {
  return TOP_MENU_EXCLUDED_SOURCE_IDS.includes(sourceId)
}
