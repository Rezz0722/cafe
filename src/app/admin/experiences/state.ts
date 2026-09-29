export interface ExperienceCurationState {
  ok: boolean
  error?: string
  message?: string
  navigateTo?: string
  savedAt?: number
}

export const EMPTY_EXPERIENCE_CURATION_STATE: ExperienceCurationState = { ok: false }
