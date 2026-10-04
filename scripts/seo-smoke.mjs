#!/usr/bin/env node

/**
 * کنترل سریع SEO/GEO روی HTML واقعیِ سرو‌شده.
 *
 *   npm run seo:smoke -- https://dev.kucafe.ir
 *   npm run seo:smoke -- https://kucafe.ir
 *
 * این تست امتیاز رتبه‌بندی نیست؛ جلوی regressionهای قابل‌اندازه‌گیری مثل
 * canonical گمشده، چند H1، JSON-LD خراب، لینک ۴۰۴ و مسدودشدن OAI-SearchBot
 * را پیش از انتشار می‌گیرد.
 */

import { drainResponse } from './lib/drain-response.mjs'

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:9091')
const failures = []

function check(condition, message) {
  if (condition) console.log(`✓ ${message}`)
  else {
    console.error(`✗ ${message}`)
    failures.push(message)
  }
}

async function get(path) {
  const response = await fetch(new URL(path, base), {
    headers: { 'user-agent': 'KuCafe-SEO-Smoke/1.0' },
  })
  const text = await response.text()
  return { response, text }
}

function matches(html, pattern) {
  return [...html.matchAll(pattern)]
}

const home = await get('/')
check(home.response.ok, `صفحهٔ اصلی HTTP ${home.response.status}`)

const title = matches(home.text, /<title>(.*?)<\/title>/gs)[0]?.[1] ?? ''
const description = matches(home.text, /<meta name="description" content="(.*?)"\/>/gs)[0]?.[1] ?? ''
const canonicals = matches(home.text, /<link rel="canonical" href="(.*?)"\/>/g)
const h1s = matches(home.text, /<h1\b[^>]*>/g)
const jsonScripts = matches(
  home.text,
  /<script type="application\/ld\+json">(.*?)<\/script>/gs,
).map((match) => match[1])

check(title.length >= 25 && title.length <= 70, `title معنادار (${title.length} نویسه)`)
check(description.length >= 80 && description.length <= 180, `description معنادار (${description.length} نویسه)`)
check(canonicals.length === 1 && /^https:\/\//.test(canonicals[0]?.[1] ?? ''), 'یک canonical مطلق')
check(h1s.length === 1, 'دقیقاً یک H1')
check(/property="og:title"/.test(home.text) && /name="twitter:card"/.test(home.text), 'Open Graph و Twitter Card')
check(/rel="manifest"/.test(home.text) && /rel="icon"/.test(home.text), 'manifest و favicon')

const jsonTypes = new Set()
let websiteAliases = []
let jsonValid = jsonScripts.length > 0
for (const raw of jsonScripts) {
  try {
    const value = JSON.parse(raw)
    for (const node of value['@graph'] ?? [value]) {
      if (node?.['@type']) jsonTypes.add(node['@type'])
      if (node?.['@type'] === 'WebSite') websiteAliases = node.alternateName ?? []
    }
  } catch {
    jsonValid = false
  }
}
check(jsonValid, 'JSON-LD معتبر')
check(websiteAliases[0] === 'KuCafe', 'هویت لاتین متمایز، اولین نام جایگزین برند')
check(
  ['کوکافه', 'KuCafe', 'kucafe.ir'].every((alias) => websiteAliases.includes(alias)),
  'نام‌های جایگزین برند در WebSite JSON-LD',
)
for (const type of ['Organization', 'WebSite', 'CollectionPage', 'FAQPage']) {
  check(jsonTypes.has(type), `JSON-LD نوع ${type}`)
}

const [robots, sitemap, manifest, llms] = await Promise.all([
  get('/robots.txt'),
  get('/sitemap.xml'),
  get('/manifest.webmanifest'),
  get('/llms.txt'),
])
check(robots.response.ok && /User-Agent: OAI-SearchBot/i.test(robots.text), 'دسترسی OAI-SearchBot در robots.txt')
check(!/User-Agent: OAI-SearchBot[\s\S]*?Disallow: \/\s*(?:\n|$)/i.test(robots.text), 'محتوای عمومی برای OAI-SearchBot مسدود نیست')
check(sitemap.response.ok && /<loc>https:\/\/kucafe\.ir\/<\/loc>/.test(sitemap.text), 'صفحهٔ اصلی در sitemap')
check(/<loc>https:\/\/kucafe\.ir\/mashhad<\/loc>/.test(sitemap.text), 'هاب محله‌ها در sitemap')
check(/<loc>https:\/\/kucafe\.ir\/mashhad\/menu<\/loc>/.test(sitemap.text), 'هاب منو در sitemap')
for (const path of ['/about', '/methodology', '/editorial-policy', '/privacy']) {
  check(sitemap.text.includes(`<loc>https://kucafe.ir${path}</loc>`), `${path} در sitemap`)
}

let manifestValid = false
try {
  const parsed = JSON.parse(manifest.text)
  manifestValid = Boolean(parsed.name && parsed.start_url === '/' && parsed.icons?.length)
} catch {}
check(manifest.response.ok && manifestValid, 'Web App Manifest معتبر')
check(
  llms.response.ok && /روش داده‌ها/.test(llms.text) && /\/mashhad\/menu/.test(llms.text) && /کوکافه/.test(llms.text),
  'llms.txt ماشین‌خوان و دارای منابع اصلی',
)

// مسیرهای محتوایی اصلی باید مستقل از خانه، HTML کامل و قابل ایندکس بدهند.
// یک دستهٔ پرتکرار نیز route داینامیک منو را در هر انتشار واقعاً تست می‌کند.
for (const path of [
  '/mashhad',
  '/mashhad/menu',
  '/mashhad/menu/breakfast',
  '/about',
  '/methodology',
  '/editorial-policy',
  '/privacy',
]) {
  const page = await get(path)
  const pageTitle = matches(page.text, /<title>(.*?)<\/title>/gs)[0]?.[1] ?? ''
  const pageDescription = matches(page.text, /<meta name="description" content="(.*?)"\/>/gs)[0]?.[1] ?? ''
  const pageCanonical = matches(page.text, /<link rel="canonical" href="(.*?)"\/>/g)
  const pageH1 = matches(page.text, /<h1\b[^>]*>/g)
  const pageJson = matches(page.text, /<script type="application\/ld\+json">(.*?)<\/script>/gs)
  let pageJsonValid = pageJson.length > 0
  for (const match of pageJson) {
    try { JSON.parse(match[1]) } catch { pageJsonValid = false }
  }
  check(
    page.response.ok && pageTitle.length >= 15 && pageDescription.length >= 70 &&
      pageCanonical.length === 1 && pageH1.length === 1 && pageJsonValid,
    `${path} آمادهٔ ایندکس (HTTP، metadata، H1، canonical، JSON-LD)`,
  )
}

const hrefs = [
  ...new Set(
    matches(home.text, /href="(\/[^"]*)"/g)
      .map((match) => match[1].replaceAll('&amp;', '&'))
      .filter((href) => !href.startsWith('/_next/')),
  ),
]
let cursor = 0
const broken = []
async function linkWorker() {
  while (cursor < hrefs.length) {
    const href = hrefs[cursor++]
    try {
      const response = await fetch(new URL(href, base), {
        redirect: 'manual',
        headers: { 'user-agent': 'KuCafe-SEO-Smoke/1.0' },
      })
      await drainResponse(response)
      if (response.status >= 400) broken.push(`${response.status} ${href}`)
    } catch (error) {
      broken.push(`${href}: ${String(error)}`)
    }
  }
}
await Promise.all(Array.from({ length: 8 }, linkWorker))
check(broken.length === 0, `${hrefs.length} لینک داخلی صفحهٔ اصلی سالم`)
if (broken.length) console.error(broken.join('\n'))

const search = await get('/search?q=pasta')
check(search.response.ok && /name="robots" content="noindex, follow"/.test(search.text), 'جست‌وجو همچنان noindex و قابل استفاده است')
check(!/rel="canonical" href="https:\/\/kucafe\.ir\/?"/.test(search.text), 'نتایج جست‌وجو به خانه canonical نمی‌شوند')

if (failures.length) {
  console.error(`\n${failures.length} کنترل ناموفق بود.`)
  process.exit(1)
}

console.log('\n✓ کنترل فنی SEO/GEO با موفقیت تمام شد.')
