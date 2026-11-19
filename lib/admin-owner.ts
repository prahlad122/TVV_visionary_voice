import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { user } from '@/lib/db/schema'

export async function findAdminOwnerId() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (!adminEmail) throw new Error('Admin email is not configured.')
  const [owner] = await db.select({ id: user.id }).from(user)
    .where(sql`lower(${user.email}) = ${adminEmail}`)
    .limit(1)
  return owner?.id ?? null
}
