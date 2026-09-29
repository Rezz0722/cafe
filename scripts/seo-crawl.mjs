#!/usr/bin/env node

/**
 * Crawl تمام URLهای کانونی sitemap روی یک محیط دلخواه.
 *
 *   npm run seo:crawl -- https://dev.kucafe.ir
 *   npm run seo:crawl -- https://kucafe.ir --limit=50
 *
 * URLهای sitemap همیشه دامنهٔ اصلی‌اند، اما path همان URL روی base ورودی
 * واکشی می‌شود؛ بنابراین قبل از انتشار می‌توان canonical تولید را روی dev
 * کنترل کرد. این ابزار فقط GET می‌زند و هیچ داده‌ای را تغییر نمی‌دهد.
 */

const base = new URL(process.argv.find((arg) => /^https?:\/\//.test(arg)) ?? 'http://127.0.0.1:9091')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : Infinity
// صفحهٔ کافه چند query موازی برای منو/ساعت/تماس دارد؛ crawl نباید خودش با
// ده‌ها query هم‌زمان، محیط پیش‌نمایش را overload و 502 مصنوعی تولید کند.
const concurrency = 3

function all(html, pattern) { return [...html.matchAll(pattern)] }
function decode(value) {
  return value
    .replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<').replaceAll('&gt;', '>')
}

function normalizeUrl(value) {
  const url = new URL(value)
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/$/, '')
  return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/')
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'user-agent': 'KuCafe-SEO-Crawl/1.0' },
  })
  return { response, text: await response.text() }
}

const sitemapResponse = await fetchText(new URL('/sitemap.xml', base))
if (!sitemapResponse.response.ok) throw new Error(`sitemap: HTTP ${sitemapResponse.response.status}`)

const canonicalUrls = all(sitemapResponse.text, /<loc>(.*?)<\/loc>/g).map((match) => decode(match[1]))
const urls = canonicalUrls.slice(0, limit)
const failures = []
const warnings = []
const titleOwners = new Map()
const canonicalOwners = new Map()
let cursor = 0
let passed = 0

function owner(map, key, url) {
  const previous = map.get(key)
  if (previous && previous !== url) return previous
  map.set(key, url)
  return null
}

async function inspect(canonicalUrl) {
  const canonical = new URL(canonicalUrl)
  const target = new URL(canonical.pathname + canonical.search, base)
  const errors = []
  let page
  try { page = await fetchText(target) }
  catch (error) {
    failures.push(`${canonical.pathname}: fetch failed (${String(error)})`)
    return
  }

  const html = page.text
  if (!page.response.ok) errors.push(`HTTP ${page.response.status}`)
  const titles = all(html, /<title>(.*?)<\/title>/gs).map((match) => decode(match[1].trim()))
  const descriptions = all(html, /<meta name="description" content="(.*?)"\/>/gs).map((match) => decode(match[1].trim()))
  const canonicals = all(html, /<link rel="canonical" href="(.*?)"\/>/g).map((match) => decode(match[1]))
  const h1s = all(html, /<h1\b[^>]*>/g)
  const robots = all(html, /<meta name="robots" content="(.*?)"\/>/g).map((match) => match[1])
  const jsonScripts = all(html, /<script type="application\/ld\+json">(.*?)<\/script>/gs)

  if (titles.length !== 1) errors.push(`${titles.length} title`)
  else if (titles[0].length < 10) errors.push(`title کوتاه (${titles[0].length})`)
  if (descriptions.length !== 1) errors.push(`${descriptions.length} description`)
  else if (descriptions[0].length < 60) errors.push(`description کوتاه (${descriptions[0].length})`)
  if (canonicals.length !== 1) errors.push(`${canonicals.length} canonical`)
  else if (normalizeUrl(canonicals[0]) !== normalizeUrl(canonicalUrl)) errors.push(`canonical=${canonicals[0]}`)
  if (h1s.length !== 1) errors.push(`${h1s.length} H1`)
  if (robots.some((value) => /noindex/i.test(value))) errors.push('noindex در sitemap')
  if (jsonScripts.length === 0) errors.push('بدون JSON-LD')
  for (const script of jsonScripts) {
    try { JSON.parse(script[1]) }
    catch { errors.push('JSON-LD نامعتبر'); break }
  }

  if (page.response.ok && titles[0]) {
    const duplicate = owner(titleOwners, titles[0], canonicalUrl)
    if (duplicate) warnings.push(`عنوان تکراری: ${canonicalUrl} = ${duplicate}`)
  }
  if (page.response.ok && canonicals[0]) {
    const duplicate = owner(canonicalOwners, canonicals[0], canonicalUrl)
    if (duplicate) errors.push(`canonical مشترک با ${duplicate}`)
  }

  if (errors.length) failures.push(`${canonical.pathname}: ${errors.join('؛ ')}`)
  else passed += 1
}

async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++]
    await inspect(url)
  }
}

await Promise.all(Array.from({ length: concurrency }, worker))

console.log(`\nبررسی ${urls.length} از ${canonicalUrls.length} URL کانونی`)
console.log(`✓ سالم: ${passed}`)
console.log(`✗ خطا: ${failures.length}`)
console.log(`△ هشدار: ${warnings.length}`)
if (failures.length) console.error(`\n${failures.slice(0, 40).join('\n')}`)
if (warnings.length) console.warn(`\n${warnings.slice(0, 20).join('\n')}`)
if (failures.length) process.exit(1)
