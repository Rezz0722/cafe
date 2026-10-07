# Menu aggregate analytics — Phase 2, step 4

## Measurement contract

- Category header or product detail summary must be at least 10% intersecting the viewport for one uninterrupted second while the document is visible.
- Search results, category-picker overlay, lightbox, hidden mobile menu and prefetched pages do not constitute category views. Product cards and lightboxes are not product-detail views.
- Same target in the same tab is suppressed for 30 minutes via sessionStorage, with a bounded memory fallback. Clearing storage, opening another tab or browser, exceeding the 500-key bound, or blocked storage can increase repeats. This is not a unique-customer metric.
- POST `/api/track/menu` accepts same-origin JSON, positive int32 place/target IDs and a random v4 event nonce. Chunked and ordinary bodies are bounded to 512 bytes. Cookies are omitted by this tracker; this endpoint does not inspect login or create cookies.
- Known bots, prefetch/prerender, DNT/GPC and disabled `trackPageViews` are skipped. The existing general page-view tracker remains independent.
- Request retry nonce suppression is process-local, limited to 5,000 entries/30 minutes. A ceiling of 600 candidate writes per process/minute protects the aggregate write path. Eviction/restart/multiple replicas may permit repeat requests; this is not a distributed fraud-prevention service. Invalid or private targets never write but consume the candidate ceiling.
- Network errors, disabled tracking, browser limitations and ceiling drops can undercount. HTTP 204 is best-effort acknowledgement, not proof of a durable event. Client suppresses repeats after that acknowledgement; it does not retry indefinitely.

## Data and permissions

Reuse `daily_stat` only. No schema migration, raw event history, IP, user/account/session identifier or referrer is stored for these counters. Metrics are `menu_section_views` and `menu_item_views`; `ref_id` is `<placeId>:<internalTargetId>` and `day` is UTC. The existing rollup does not replace these metric keys.

A conditional atomic INSERT…SELECT…ON DUPLICATE KEY UPDATE checks published/temporarily-closed cafe, matching item/section/place IDs, shared/branch scope and non-archived item before incrementing. A category without a public item cannot count.

Report reads independently authorize an active real account without mandatory password reset plus actual admin or active branch role. View-as, foreign branches, blocked accounts and revoked roles cannot read. Private metrics are not included in public cafe/item responses.

The owner overview reports today plus 29 previous UTC calendar days, totals and top ten entries per type. Historical removed/private targets retain counts under a neutral label, not their current private name. Stopping collection does not erase historical aggregates. New menu import IDs may split historical aggregates; stable cross-import product analytics is not claimed.

## Validation

`npm run typecheck`, `npm test`, targeted ESLint and `git diff --check`.

Hosted CI runs `KUCAFE_MENU_STATS_DB_TEST=1 node --import tsx --conditions=react-server --test src/core/analytics/menuStats.integration.test.ts` against its disposable MariaDB service. Local integration refuses any database except localhost `kucafe_menu_stats_test`; CI exception requires GitHub Actions and localhost `kucafe`.

`scripts/menu-stats-ui-smoke.ts` uses real Next.js, synthetic owner and menu only in a disposable DB, Chromium 360/390/768/1440 and Firefox/WebKit 360/1440 plus DNT/GPC cases. It records completion separately from partial results. It is not a physical-device or production-pilot test.

## Deployment / rollback

Feature branch → protected production PR → required hosted CI → existing self-hosted deploy. Preserve current Docker app and immediate rollback, private DB backup and all media. No new migration is necessary. Rollback application through the normal GitHub flow; the additive aggregate rows are harmless to the old application and should not be deleted to roll back.

Never create synthetic owners, roles, sessions or menu items in production. Production smoke may verify public SSR and privacy preferences without generating customer activity; authenticated owner verification requires an authorized real pilot.
