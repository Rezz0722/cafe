import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { chromium, type Browser, type Page } from 'playwright'

const args = process.argv.slice(2), publicMode = args[0] === '--public', lifecycleOnly = args[0] === '--lifecycle-only'
const bases = publicMode || lifecycleOnly ? args.slice(1) : [args[0] ?? 'http://127.0.0.1:9096']
assert.ok(bases.length > 0, 'At least one test URL is required')
for (const base of bases) assert.match(base, /^https:\/\/(dev\.)?kucafe\.ir$|^http:\/\/127\.0\.0\.1:\d+$/)
// Playwright 1.55 gates service-worker network emulation behind this flag.
// Otherwise setOffline affects pages but the worker can still reach the server.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1'
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-swiftshader'] })
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'
const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
await mkdir('var/qa/pwa', { recursive: true })

async function controlled(page: Page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 45000 })
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
}
async function cachePaths(page: Page) {
  return page.evaluate(async () => {
    const paths: string[] = []
    for (const name of await caches.keys()) if (name.startsWith('kucafe-pwa-')) {
      for (const request of await (await caches.open(name)).keys()) paths.push(new URL(request.url).pathname)
    }
    return paths.sort()
  })
}
const expected = ['/offline.html', '/brand/app-icon-192.png', '/fonts/Dana-Regular.woff2'].sort()

async function ui(base: string, browser: Browser) {
  const slug = new URL(base).hostname
  for (const width of [320, 390, 430, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700, userAgent: width < 700 ? android : undefined })
    const page = await context.newPage(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    assert.equal((await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }))?.status(), 200)
    await controlled(page)
    await page.getByRole('heading', { name: 'نصب روی اندروید', exact: true }).waitFor()
    await page.getByRole('heading', { name: 'نصب روی آیفون', exact: true }).waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    assert.deepEqual(await cachePaths(page), expected)
    const worker = await context.request.get(`${base}/sw.js`)
    assert.equal(worker.status(), 200); assert.match(worker.headers()['content-type'], /javascript/)
    assert.match(worker.headers()['cache-control'], /no-store/); assert.equal(worker.headers()['service-worker-allowed'], '/')
    const manifestResponse = await context.request.get(`${base}/manifest.webmanifest`), manifest = await manifestResponse.json()
    assert.equal(manifestResponse.status(), 200); assert.match(manifestResponse.headers()['content-type'], /manifest\+json/)
    assert.equal(manifest.id, '/'); assert.equal(manifest.display, 'standalone'); assert.equal(manifest.scope, '/')
    for (const icon of manifest.icons) { const response = await context.request.get(`${base}${icon.src}`); assert.equal(response.status(), 200); assert.match(response.headers()['content-type'], /image\/png/) }
    await page.screenshot({ path: `var/qa/pwa/install-${slug}-${width}.png`, fullPage: true })
    await page.screenshot({ path: `var/qa/pwa/install-top-${slug}-${width}.png` })
    // Test application wiring without accepting a real system install dialog.
    await page.evaluate(`(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      window.qaPromptCalls = 0;
      Object.assign(event, { prompt: async () => { window.qaPromptCalls++; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
      window.dispatchEvent(event);
    })()`)
    await page.getByRole('button', { name: 'نصب کوکافه', exact: true }).click()
    await page.getByText('درخواست نصب پذیرفته شد؛ آماده‌شدن آیکون ممکن است کمی طول بکشد.', { exact: true }).waitFor()
    assert.equal(await page.evaluate('window.qaPromptCalls'), 1)
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
    await page.getByText('درخواست نصب ثبت شد؛ از آیکون کوکافه روی گوشی وارد شو.', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    await context.close(); console.log(`✓ ${base} ${width}: manifest/icons/MIME/cache/guide/prompt wiring; no overflow or runtime errors`)
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ios, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await controlled(page)
  await page.getByRole('link', { name: 'راهنمای نصب در آیفون', exact: true }).waitFor()
  await context.setOffline(true)
  await page.getByText('آفلاین هستی؛ قیمت، تخفیف و وضعیت نمایش‌داده‌شده ممکن است به‌روز نباشد.', { exact: true }).waitFor()
  assert.equal((await page.goto(`${base}/install?from=offline-test`, { waitUntil: 'domcontentloaded' }))?.status(), 503)
  await page.getByRole('heading', { name: 'ارتباط با کوکافه برقرار نشد' }).waitFor()
  assert.ok(page.url().endsWith('/install?from=offline-test'))
  await page.getByRole('button', { name: 'تلاش دوباره' }).click()
  await page.getByText('هنوز آفلاین هستی؛ اینترنت را وصل کن.', { exact: true }).waitFor()
  assert.deepEqual(await cachePaths(page), expected)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth))
  await page.screenshot({ path: `var/qa/pwa/offline-${slug}-390.png` })
  await context.setOffline(false)
  await page.getByText('اتصال برگشته؛ «تلاش دوباره» را بزن.', { exact: true }).waitFor()
  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: 'تلاش دوباره' }).click()])
  await page.getByRole('link', { name: 'راهنمای نصب در آیفون', exact: true }).waitFor()
  assert.ok(page.url().endsWith('/install?from=offline-test'))
  await context.close(); console.log(`✓ ${base}: iOS guidance emulated; real offline fallback/retry restores original URL and caches no page data`)

  const standalone = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ios, isMobile: true, hasTouch: true })
  await standalone.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }))
  const app = await standalone.newPage(); await app.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await app.getByText('کوکافه را در حالت اپ باز کرده‌ای.', { exact: true }).waitFor()
  await app.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await app.locator('main').getByRole('link', { name: 'نصب کوکافه روی گوشی', exact: true }).waitFor({ state: 'detached' })
  await standalone.close(); console.log(`✓ ${base}: standalone detection hides redundant home install CTA`)
}

async function nativeInstallability(base: string) {
  const profile = await mkdtemp('/tmp/kucafe-pwa-chrome-')
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: ['--enable-unsafe-swiftshader'] })
  try {
    const page = await context.newPage()
    await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await controlled(page)
    await page.locator('head link[rel="manifest"]').waitFor({ state: 'attached' })
    const cdp = await context.newCDPSession(page); await cdp.send('Page.enable')
    let manifest = await cdp.send('Page.getAppManifest')
    for (let tries = 0; tries < 30 && !manifest.data?.trim(); tries++) {
      await page.waitForTimeout(500); manifest = await cdp.send('Page.getAppManifest')
    }
    assert.ok(manifest.data?.trim(), `Browser did not load manifest: ${JSON.stringify(manifest)}`)
    assert.deepEqual(manifest.errors, []); assert.equal(JSON.parse(manifest.data!).display, 'standalone')
    const result = await cdp.send('Page.getInstallabilityErrors')
    assert.deepEqual(result.installabilityErrors, []); await cdp.detach()
    console.log(`✓ ${base}: native Chromium normal-profile manifest/installation criteria have no errors (not an incognito check)`)
  } finally {
    await context.close(); assert.ok(profile.startsWith('/tmp/kucafe-pwa-chrome-')); await rm(profile, { recursive: true, force: true })
  }
}

async function lifecycle(upstream: string) {
  const script = await readFile('public/sw.js', 'utf8')
  let revision = 'one', writes = 0, value = 'first'
  const server = createServer(async (request, response) => {
    try {
      if (request.url === '/sw.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' })
        response.end(script.replace(/const VERSION = '[^']+';/, `const VERSION = 'kucafe-pwa-qa-${revision}';`)); return
      }
      if (request.url?.startsWith('/qa-api')) {
        if (request.method === 'POST') writes++
        response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify({ value })); return
      }
      if (request.url?.startsWith('/qa-private')) {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); response.end('<html><body>private-fixture-not-to-cache</body></html>'); return
      }
      const remote = await fetch(`${upstream}${request.url}`, { redirect: 'manual' })
      const headers: Record<string, string> = {}
      for (const [name, header] of remote.headers) if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(name)) headers[name] = header
      response.writeHead(remote.status, headers); response.end(Buffer.from(await remote.arrayBuffer()))
    } catch { response.writeHead(502); response.end('QA upstream failed') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address !== 'string')
  const base = `http://127.0.0.1:${address.port}`, context = await browser.newContext()
  try {
    const page = await context.newPage(), other = await context.newPage(), errors: string[] = []
    page.on('pageerror', error => errors.push(error.message)); other.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await controlled(page)
    await page.goto(`${base}/qa-private`); assert.match(await page.content(), /private-fixture-not-to-cache/)
    assert.deepEqual(await cachePaths(page), expected)
    await page.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await controlled(page)
    await other.goto(`${base}/install`, { waitUntil: 'domcontentloaded', timeout: 120000 }); await controlled(other)
    assert.equal(await page.evaluate(async () => (await (await fetch('/qa-api')).json()).value), 'first')
    value = 'fresh'
    assert.equal(await page.evaluate(async () => (await (await fetch('/qa-api')).json()).value), 'fresh')
    for (const tab of [page, other]) await tab.evaluate(() => { const input = document.createElement('input'); input.id = 'qa-unsaved'; input.value = 'unsaved-cafe-edit'; document.body.append(input) })
    await page.evaluate(async () => { await caches.open('another-app-fixture') })
    revision = 'two'; await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
    await page.getByRole('button', { name: 'به‌روزرسانی', exact: true }).waitFor({ timeout: 45000 })
    assert.equal(await page.locator('#qa-unsaved').inputValue(), 'unsaved-cafe-edit')
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'به‌روزرسانی', exact: true }).click()
    assert.equal(await page.locator('#qa-unsaved').inputValue(), 'unsaved-cafe-edit')
    page.once('dialog', dialog => dialog.accept())
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.getByRole('button', { name: 'به‌روزرسانی', exact: true }).click()])
    await controlled(page)
    assert.equal(await other.locator('#qa-unsaved').inputValue(), 'unsaved-cafe-edit')
    const keys = await page.evaluate(async () => caches.keys())
    assert.ok(keys.includes('kucafe-pwa-qa-two')); assert.ok(!keys.includes('kucafe-pwa-qa-one')); assert.ok(keys.includes('another-app-fixture'))
    assert.deepEqual(await cachePaths(page), expected)
    assert.deepEqual(errors, [])
    await context.setOffline(true)
    const failed = await page.evaluate(async () => { try { await fetch('/qa-api', { method: 'POST', body: 'must-not-replay' }); return false } catch { return true } })
    assert.ok(failed); assert.equal(writes, 0)
    assert.equal((await page.goto(`${base}/qa-private?return=kept`, { waitUntil: 'domcontentloaded' }))?.status(), 503)
    assert.ok(!(await page.content()).includes('private-fixture-not-to-cache'))
    await context.setOffline(false)
    await page.getByText('اتصال برگشته؛ «تلاش دوباره» را بزن.', { exact: true }).waitFor()
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.getByRole('button', { name: 'تلاش دوباره' }).click()])
    assert.equal(writes, 0); assert.match(await page.content(), /private-fixture-not-to-cache/)
    console.log('✓ Real worker lifecycle: waiting update does not reload forms; cancel preserves form; explicit update reloads only requesting tab; only own old cache deleted; private HTML/API never cached; offline write never replayed')
  } finally { await context.close(); await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections() }) }
}

try {
  for (const base of bases) { if (!lifecycleOnly) await ui(base, browser); await nativeInstallability(base) }
  if (!publicMode) await lifecycle(bases[0])
} finally { await browser.close() }
