/** Read-only release gate: place timestamps must not change during migrations. */
import { createHash } from 'node:crypto'
import mysql from 'mysql2/promise'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const conn = await mysql.createConnection(process.env.DATABASE_URL)
try {
  await conn.query("SET time_zone = '+00:00'")
  const [places] = await conn.query(`SELECT id,
    UNIX_TIMESTAMP(last_verified_at) AS verified,
    UNIX_TIMESTAMP(updated_at) AS updated
    FROM place ORDER BY id`)
  const [pricedItems] = await conn.query(`SELECT id,
    UNIX_TIMESTAMP(price_updated_at) AS priceUpdated
    FROM menu_item WHERE price IS NOT NULL ORDER BY id`)
  console.log(createHash('sha256').update(JSON.stringify({ places, pricedItems })).digest('hex'))
} finally {
  await conn.end()
}
