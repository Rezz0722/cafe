/** Apply the additive project migrations that predate Drizzle's journal. */
import { execFileSync } from 'node:child_process'

const files = [
  'drizzle/0001_menu_item_public_identity.sql',
  'drizzle/0002_search_entity_analytics.sql',
  'drizzle/0003_menu_management.sql',
  'drizzle/0004_price_stats_policy.sql',
  'drizzle/0005_auth_branch_security.sql',
  'drizzle/0006_relational_integrity.sql',
  'drizzle/0007_menu_item_variants.sql',
  'drizzle/0008_review_items.sql',
  'drizzle/0009_blogger_reviews.sql',
  'drizzle/0010_customer_club.sql',
  'drizzle/0011_venue_discounts.sql',
  'drizzle/0012_experience_engine.sql',
]

for (const file of files) {
  console.log(`\n== ${file} ==`)
  execFileSync(process.execPath, ['scripts/run-sql.mjs', file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
}
