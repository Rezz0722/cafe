/**
 * Safely adopt a legacy database into Drizzle's migration journal.
 *
 * KuCafe's first production schema was created by the 0000 Drizzle migration,
 * but the CLI stopped before writing its journal row. Re-running `migrate`
 * therefore tries to create the existing tables again and exits before the
 * additive project migrations can run.
 *
 * This script only writes the missing baseline row when the database already
 * contains every table/column, unique index and foreign key described by the
 * initial snapshot. An empty database is left untouched so normal fresh
 * installs still let Drizzle create the schema. Partial or ambiguous schemas
 * fail closed.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'

const checkOnly = process.argv.includes('--check')
const snapshotPath = 'drizzle/meta/0000_snapshot.json'
const journalPath = 'drizzle/meta/_journal.json'
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'))
const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
const baseline = journal.entries?.[0]

if (!baseline || baseline.idx !== 0 || !baseline.tag) {
  throw new Error('Drizzle baseline metadata is missing or invalid.')
}

const migrationPath = `drizzle/${baseline.tag}.sql`
const migrationSql = readFileSync(migrationPath, 'utf8')
const migrationHash = createHash('sha256').update(migrationSql).digest('hex')
function envValue(key) {
  if (process.env[key]?.trim()) return process.env[key].trim()
  try {
    const line = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .find((row) => row.startsWith(`${key}=`))
    return line?.slice(key.length + 1).trim()
  } catch {
    return undefined
  }
}

const databaseUrl = envValue('DATABASE_URL')

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for migration baseline inspection.')
}

function normalizeType(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b(boolean|bool)\b/g, 'tinyint(1)')
    .replace(/\bjson\b/g, 'longtext')
    .replace(/\b(tinyint|smallint|mediumint|int|integer|bigint)\(\d+\)/g, '$1')
    .replace(/\binteger\b/g, 'int')
    .replace(/\s+/g, ' ')
    .trim()
}

function enumValues(type) {
  const match = String(type).toLowerCase().match(/^enum\((.*)\)$/)
  return match ? match[1].split(',').map((value) => value.trim()) : null
}

function compatibleType(expected, actual) {
  const expectedEnum = enumValues(expected)
  const actualEnum = enumValues(actual)
  if (expectedEnum && actualEnum) {
    const actualValues = new Set(actualEnum)
    return expectedEnum.every((value) => actualValues.has(value))
  }
  return normalizeType(expected) === normalizeType(actual)
}

const connection = await mysql.createConnection({ uri: databaseUrl, charset: 'utf8mb4' })

try {
  const [journalTables] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '__drizzle_migrations'`,
  )
  const [presentTables] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '__drizzle_migrations'`,
  )
  const expectedTables = Object.keys(snapshot.tables)
  const presentTableNames = new Set(presentTables.map((row) => row.TABLE_NAME))
  const baselineTablesPresent = expectedTables.filter((name) => presentTableNames.has(name))

  if (baselineTablesPresent.length === 0 && journalTables.length === 0) {
    console.log('Drizzle baseline: fresh database detected; normal migration will initialize it.')
    process.exitCode = 0
  } else {
    let journalRows = []
    if (journalTables.length > 0) {
      ;[journalRows] = await connection.query(
        'SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at, id',
      )
    }

    const recorded = journalRows.some(
      (row) => row.hash === migrationHash && Number(row.created_at) === Number(baseline.when),
    )
    if (recorded) {
      console.log('Drizzle baseline: journal already contains the initial migration.')
      process.exitCode = 0
    } else if (journalRows.length > 0) {
      throw new Error(
        'Drizzle journal is non-empty but does not contain the expected baseline; refusing to guess.',
      )
    } else if (baselineTablesPresent.length !== expectedTables.length) {
      const missing = expectedTables.filter((name) => !presentTableNames.has(name))
      throw new Error(
        `Partial legacy schema detected (${baselineTablesPresent.length}/${expectedTables.length} baseline tables). ` +
          `Missing: ${missing.join(', ')}`,
      )
    } else {
      const [columns] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`,
      )
      const actualColumns = new Map(
        columns.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row]),
      )
      const problems = []

      for (const [tableName, table] of Object.entries(snapshot.tables)) {
        for (const [columnName, expected] of Object.entries(table.columns)) {
          const actual = actualColumns.get(`${tableName}.${columnName}`)
          if (!actual) {
            problems.push(`missing column ${tableName}.${columnName}`)
            continue
          }
          if (!compatibleType(expected.type, actual.COLUMN_TYPE)) {
            problems.push(
              `incompatible type ${tableName}.${columnName}: expected ${expected.type}, got ${actual.COLUMN_TYPE}`,
            )
          }
          // Later additive migrations may safely make a nullable column stricter,
          // but a required baseline column must never have become nullable.
          if (expected.notNull && actual.IS_NULLABLE !== 'NO') {
            problems.push(`nullable required column ${tableName}.${columnName}`)
          }
        }
      }

      const [indexes] = await connection.query(
        `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      )
      const actualIndexes = new Map()
      for (const row of indexes) {
        const key = `${row.TABLE_NAME}.${row.INDEX_NAME}`
        const index = actualIndexes.get(key) ?? { columns: [], unique: Number(row.NON_UNIQUE) === 0 }
        index.columns.push(row.COLUMN_NAME)
        actualIndexes.set(key, index)
      }
      for (const [tableName, table] of Object.entries(snapshot.tables)) {
        for (const [indexName, expected] of Object.entries(table.indexes)) {
          if (!expected.isUnique) continue
          const actual = actualIndexes.get(`${tableName}.${indexName}`)
          if (
            !actual ||
            !actual.unique ||
            actual.columns.join(',') !== expected.columns.join(',')
          ) {
            problems.push(`missing or incompatible unique index ${tableName}.${indexName}`)
          }
        }
      }

      const [foreignKeys] = await connection.query(
        `SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE CONSTRAINT_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
      )
      const actualForeignKeys = new Set(
        foreignKeys.map((row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`),
      )
      for (const [tableName, table] of Object.entries(snapshot.tables)) {
        for (const foreignKeyName of Object.keys(table.foreignKeys)) {
          if (!actualForeignKeys.has(`${tableName}.${foreignKeyName}`)) {
            problems.push(`missing foreign key ${tableName}.${foreignKeyName}`)
          }
        }
      }

      if (problems.length > 0) {
        throw new Error(
          `Legacy schema is not safe to baseline (${problems.length} mismatch(es)):\n` +
            problems.slice(0, 20).map((problem) => `- ${problem}`).join('\n'),
        )
      }

      if (checkOnly) {
        console.log(
          `Drizzle baseline: legacy schema is compatible (${expectedTables.length} tables); journal write is required.`,
        )
      } else {
        if (journalTables.length === 0) {
          await connection.query(`
            CREATE TABLE __drizzle_migrations (
              id SERIAL PRIMARY KEY,
              hash text NOT NULL,
              created_at bigint
            )
          `)
        }
        await connection.beginTransaction()
        try {
          const [result] = await connection.execute(
            `INSERT INTO __drizzle_migrations (hash, created_at)
             SELECT ?, ? FROM DUAL
             WHERE NOT EXISTS (
               SELECT 1 FROM __drizzle_migrations WHERE hash = ? AND created_at = ?
             )`,
            [migrationHash, baseline.when, migrationHash, baseline.when],
          )
          await connection.commit()
          if (result.affectedRows !== 1) {
            throw new Error('Baseline journal row was not inserted.')
          }
        } catch (error) {
          await connection.rollback()
          throw error
        }
        console.log(
          `Drizzle baseline: adopted verified legacy schema (${expectedTables.length} tables).`,
        )
      }
    }
  }
} finally {
  await connection.end()
}
