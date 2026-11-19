import { readFile } from 'node:fs/promises'
import nextEnv from '@next/env'
import { Pool } from 'pg'

// Load the same .env.local/.env files as the Next.js app when this script is
// run directly with `npm run db:migrate`.
const { loadEnvConfig } = nextEnv
loadEnvConfig(process.cwd())

// Use Prisma Postgres' direct TCP URL for DDL when the provider supplies one;
// otherwise the application's DATABASE_URL is used for the migration too.
const rawConnectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
let connectionString = rawConnectionString
if (rawConnectionString) {
  const url = new URL(rawConnectionString)
  const sslMode = url.searchParams.get('sslmode')
  if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
    url.searchParams.set('sslmode', 'verify-full')
  }
  connectionString = url.toString()
}
if (!connectionString) {
  console.error('DATABASE_URL is required to run the database migration.')
  process.exit(1)
}

const pool = new Pool({ connectionString, max: 1 })
try {
  const migration = await readFile(new URL('../lib/db/migrations/0001_initial.sql', import.meta.url), 'utf8')
  await pool.query(migration)
  console.log('The Visionary Voice database schema is ready.')
} catch (error) {
  console.error('Database migration failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
