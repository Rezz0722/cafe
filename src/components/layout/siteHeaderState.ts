/** A city prefix also contains food/experience routes; it is not a district match. */
export function isHeaderDestinationCurrent(pathname: string, href: string): boolean {
  if (href === '/mashhad') {
    return pathname === href || /^\/mashhad\/[^/]+\/?$/.test(pathname)
      && !/^\/mashhad\/(menu|experience)\/?$/.test(pathname)
  }
  if (href.includes('#')) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
