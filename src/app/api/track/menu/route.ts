import { getSettings } from '@/core/settings/store'
import { recordMenuView } from '@/core/analytics/menuStats'
import { MenuViewGate, menuRequestCountable, parseMenuView } from '@/core/analytics/menuPolicy'
import { SITE_URL } from '@/routes'
const gate = new MenuViewGate()
export async function POST(request: Request) {
  const response = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
  if (!menuRequestCountable(request.headers, new URL(SITE_URL).origin)) return response()
  try {
    const reader = request.body?.getReader()
    if (!reader) return response()
    let length = 0, body = ''
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > 512) { await reader.cancel(); return response() }
      body += decoder.decode(chunk.value, { stream: true })
    }
    body += decoder.decode()
    const view = parseMenuView(JSON.parse(body))
    if (!view || !gate.accept(view) || !(await getSettings()).trackPageViews) return response()
    await recordMenuView(view)
  } catch { console.warn('[menu-track] aggregate unavailable') }
  return response()
}
