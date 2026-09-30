export const THEME_STORAGE_KEY = 'kucafe-theme-mode'
export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto'
}

export function resolveTheme(mode: ThemeMode, systemTheme: ResolvedTheme = 'light'): ResolvedTheme {
  return mode === 'auto' ? systemTheme : mode
}

export const THEME_INIT_SCRIPT = `(()=>{try{const k=${JSON.stringify(THEME_STORAGE_KEY)};let m=localStorage.getItem(k);if(m==="tehran"||!['light','dark','auto'].includes(m))m="auto";const t=m==="auto"&&window.matchMedia('(prefers-color-scheme: dark)').matches?"dark":m==="dark"?"dark":"light";const d=document.documentElement;d.dataset.themeMode=m;d.dataset.theme=t;d.style.colorScheme=t;let e=document.querySelector('meta[name="theme-color"]');if(!e){e=document.createElement("meta");e.name="theme-color";document.head.appendChild(e)}e.content=t==="dark"?"#101722":"#fffdfa"}catch{document.documentElement.dataset.themeMode="auto";document.documentElement.dataset.theme="light"}})()`
