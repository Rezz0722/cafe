# Public search UX — QA (2026-10-18)

Baseline: `dde8f4e723944d75cddc171c7c6c08c8ec850f7d`. Scope: search presentation and shared result-card styling only; no schema, ranking, or search-service change.

- Removed the popular-dish row and its unused CSS. The menu-item tab, active dish filter, and `/search?dish=alfredo-pasta` remain functional.
- On mobile, the three search types, search form, and one compact tools row precede results. Sort and list/map controls are in the existing filter sheet. The ambiguous mobile “اعمال” button is gone; sorting applies on selection.
- Reviewed cards retain their badge but use the same border as ordinary cards. The badge and missing-image placeholder are less prominent.

Evidence: [before (390px, dark)](public-ux-search/before/search-390-dark.jpg), [after (390px, dark)](public-ux-search/after/search-390-dark.jpg), [before (390px, light)](public-ux-search/before/search-390-light.jpg), [after (390px, light)](public-ux-search/after/search-390-light.jpg). The same folders contain 360px/1440px screenshots and JSON viewport metrics. At 390px dark, page height changed from 6045px to 5969px; document horizontal overflow was 0px before and after.

Validation on the isolated production build: Typecheck pass, ESLint pass, Next.js build pass, 477 unit tests pass / 0 fail / 16 pre-existing skips. `public-search-cleanup-smoke.ts` passed 6 viewport/theme combinations, including filter-sheet and dish deep links. Updated `search-ui-smoke.ts` passed location, sort, pagination, browser-back, autocomplete and map interactions; its stale fixed venue counts and off-viewport click were corrected without relaxing product assertions. The all-route browser sweep covers 14 public paths × 3 viewports × 2 themes; see `public-ux-search/after-routes/metrics.json` for final result.

Visual limitation: the local Worktree requires the existing published `public/map` assets for map tiles. The test was rerun after those assets were mounted; no Production data or setting was changed.
