import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const globalPool = globalThis as typeof globalThis & { neonPool?: Pool }

function normalizeSslMode(connectionString: string | undefined) {
  if (!connectionString) return connectionString
  const url = new URL(connectionString)
  const sslMode = url.searchParams.get('sslmode')
  // pg-connection-string currently treats these as verify-full aliases, but
  // warns because a future major version will use libpq's weaker semantics.
  if (sslMode === 'prefer' || sslMode === 'require' || sslMode === 'verify-ca') {
    url.searchParams.set('sslmode', 'verify-full')
  }
  return url.toString()
}

export const pool = globalPool.neonPool ?? new Pool({
  connectionString: normalizeSslMode(process.env.DATABASE_URL),
  max: 5,
  idleTimeoutMillis: 30_000,
})

if (process.env.NODE_ENV !== 'production') globalPool.neonPool = pool

export const db = drizzle(pool, { schema })
