import { paths } from '@/routes'

export function mobileBottomNavHref(pathname: string, view: string | null): string | null {
  if (pathname === paths.home) return paths.home
  if (pathname === paths.search) return view === 'map' ? `${paths.search}?view=map` : paths.search
  if (pathname === paths.profile || pathname.startsWith(`${paths.profile}/`)) return paths.profile
  return null
}
