/** Only actual HTML resource attributes are URLs. Streaming RSC payloads may
 * split a resource path across script tags and must not create false 404s. */
export function extractStaticAssetUrls(html) {
  const assets = new Set()
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*?\b(?:href|src)=(["'])(\/_next\/static\/[^"']+)\1/gi)) {
    assets.add(match[2].replaceAll('&amp;', '&'))
  }
  return assets
}
