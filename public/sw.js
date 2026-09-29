/* KoCafe PWA: only the generic offline screen and its identity assets are cached.
 * NEVER cache HTML, Next RSC, APIs, accounts, menus, prices, discounts or writes.
 * Bump VERSION when changing the offline screen/assets or this cache policy.
 */
const VERSION = 'kucafe-pwa-v3-20260918';
const PREFIX = 'kucafe-pwa-';
const OFFLINE = '/offline.html';
const ASSETS = [OFFLINE, '/brand/app-icon-192.png', '/fonts/Dana-Regular.woff2'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // Cache.addAll is all-or-nothing: a failed offline dependency must not
    // activate an incomplete worker over the currently working version.
    await cache.addAll(ASSETS.map(path => new Request(path, { cache: 'reload' })));
  })());
  // Updates wait until all old tabs close, or an explicit user update request.
  // No automatic skipWaiting/reload while someone is editing their cafe.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.source && event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

async function offlineResponse() {
  const cached = await (await caches.open(VERSION)).match(OFFLINE);
  const headers = new Headers(cached?.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(cached ? await cached.text() : '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتصال برقرار نشد | کوکافه</title><h1>ارتباط با کوکافه برقرار نشد</h1><p>اتصال اینترنت را بررسی و صفحه را دوباره باز کن. قیمت و تخفیف آفلاین نمایش داده نمی‌شود.</p></html>', { status: 503, headers });
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        return response.status >= 500 ? offlineResponse() : response;
      } catch { return offlineResponse(); }
    })());
    return;
  }
  if (!url.search && ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
  // All other fetches use their original networking semantics. In particular,
  // never serve offline HTML for a JSON/RSC response and never replay a write.
});
