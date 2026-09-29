export type InstallPlatform = 'ios' | 'android' | 'desktop'

export function installPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'desktop'
}

export function inAppBrowser(userAgent: string): boolean {
  return /Instagram|FBAN|FBAV|TikTok|BytedanceWebview|Line\/|\bwv\b/i.test(userAgent)
}
