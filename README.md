# کافه‌گرد — Cafégard

راهنمای کافه‌ها و رستوران‌های مشهد. «اسم جایی رو نگو، حالت رو بگو.»

A Persian, right-to-left guide to cafés and restaurants in Mashhad. This
repository is the working code conversion of the five design mockups in
«کافه‌گرد آفلاین»: the marketing home page plus four phone-width app screens.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check, then production build into dist/
npm run typecheck  # types only, no emit
```

Node 20+ is expected. There is no backend and no network dependency: fonts are
self-hosted, the catalogue is a TypeScript module, and session state lives in
`localStorage`.

## Screens

| Route | Screen | Source mockup |
| --- | --- | --- |
| `/` | Home — hero search, featured venues, intent cards, participation | صفحه اصلی |
| `/search` | Result list, map view, filter sheet | نتایج جستجو |
| `/cafe/:id` | Venue detail — gallery, menu, hours, reviews | صفحه نمونه کافه |
| `/auth` | Sign-up flow: phone → OTP → name | ورود و پروفایل |
| `/profile` | Saved venues and reviews (auth-guarded) | ورود و پروفایل |
| `/admin` | Venue-owner panel: menu, photos, hours, tags, promotions | پنل مدیریت کافه |

The home page is a full responsive page. The other four were designed at 430px
and render inside `MobileShell`, a centred phone frame — that is intentional, not
an unfinished responsive pass.

## Layout

```
src/
  main.tsx App.tsx routes.ts     entry, route table, every URL in the app
  styles/                        tokens.css (design tokens), global.css, fonts.css
  types/                         domain model — Cafe, MenuItem, Review, …
  data/                          catalogue, taxonomy, home-page copy, admin seed
  lib/                           format (Persian numerals), storage, search
  hooks/                         auth, saved venues, URL-backed filters, toast
  components/
    layout/                      SiteHeader, SiteFooter, MobileShell
    ui/                          Chip, Switch, Toast, Stars, CafePhoto, …
    cafe/                        CafeCard (home), ResultCard (search)
    admin/                       one panel per admin tab
  pages/                         one component + one CSS module per screen
  assets/                        logo, venue photo
```

`@/` is an alias for `src/`.

### Conventions

- **Styling** is CSS Modules over the custom properties in
  `src/styles/tokens.css`. The mockups were built from inline style strings; those
  are gone. Inline `style` survives only where a value genuinely comes from data,
  such as a per-card pastel background.
- **RTL** is structural: logical properties (`inset-inline-start`,
  `padding-inline`, `margin-inline`) everywhere, never `left`/`right`.
- **Responsiveness** is CSS. The mockups tracked `window.innerWidth` in component
  state and branched on it; media queries replace that.
- **Persian numerals** are a formatting concern, not stored data. Ratings and
  prices are numbers in `data/`, rendered through `lib/format`
  (`fa`, `faDecimal`, `toman`, `faPercent`).
- **Search state lives in the URL.** `/search?q=…&intents=…&price=…&sort=…` is
  the single source of truth, so a filtered list is shareable and the back button
  steps through filter changes.

## What is mock, and what a backend would replace

The conversion is faithful to the mockups, which means the parts they only
simulated are still simulated:

- **The catalogue** (`src/data/cafes.ts`) is eight hard-coded venues. Every venue
  currently shares one menu, one hours table and one review set.
- **Authentication** has no server. The OTP step accepts any five digits; signing
  in writes a name to `localStorage` under `cafegard_user`.
- **Saved venues** are `localStorage` keys (`cafegard_saved_<id>`), not a user
  record.
- **The admin panel** edits React state. Reloading the page restores the seed
  data in `src/data/adminSeed.ts`; nothing is persisted.
- **The map view** is a CSS grid with positioned rating pins, not a tile layer.
- **Photo upload** adds placeholder tiles; no file is read or stored.
- Venue counts in the home page's intent cards (۲۱۰، ۱۴۵، ۱۸۸، ۹۷) are copy from
  the mockup, not computed from the catalogue.

## Assets

The logo/mascot and the venue photograph were extracted from the mockup bundles,
along with the nine Vazirmatn weights now served from `public/fonts`. All venues
share the one photograph the mockups shipped; `CafePhoto` falls back to a labelled
placeholder when an image is missing.
