# Search without JavaScript

The homepage search intentionally uses a native GET form. Search results must
therefore be visible on a normal document request when JavaScript is disabled.
Do not use markup existence alone as proof of this journey.

The route-level `search/loading.tsx` created an automatic Suspense boundary.
Next sent completed results inside a hidden streaming segment, requiring its
inline JavaScript to swap the skeleton with real content. Tests found that all
results remained hidden in Chromium, Firefox and WebKit with JS disabled.

Removing that route-level loading boundary makes the initial document wait for
the real result. This trades the initial server skeleton for a complete usable
response. Existing `SearchView` pending feedback remains available for hydrated
client-side filter transitions. No search queries, indexing policy, metadata,
pagination or result ranking is changed.

Regression test: `node --import tsx scripts/search-nojs-smoke.ts https://kucafe.ir`.
This must inspect a **visible** product link and follow it. A product-page JS-free
HTML render is tested; its interactive menu is not claimed to work without JS.
