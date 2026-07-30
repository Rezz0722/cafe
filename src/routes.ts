/** Every in-app URL is built here, so a path only ever changes in one place. */
export const paths = {
  home: '/',
  search: '/search',
  cafe: (id: string) => `/cafe/${id}`,
  auth: '/auth',
  profile: '/profile',
  admin: '/admin',
} as const

/** `/search?q=…`, with the query omitted when empty. */
export function searchUrl(query?: string): string {
  const q = (query ?? '').trim()
  return q ? `${paths.search}?q=${encodeURIComponent(q)}` : paths.search
}

/** `/auth?redirect=…` so the flow can return the user where they started. */
export function authUrl(redirectTo?: string): string {
  return redirectTo ? `${paths.auth}?redirect=${encodeURIComponent(redirectTo)}` : paths.auth
}

/**
 * The last step of the sign-up flow doubles as the "change your name" screen —
 * `edit=1` is what stops a signed-in visitor being bounced to their profile.
 */
export function editProfileUrl(): string {
  return `${paths.auth}?edit=1&redirect=${encodeURIComponent(paths.profile)}`
}
