import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { blogPosts } from '@/lib/db/schema'

/** Categories already used on this admin's posts, offered as suggestions in the editor. */
export async function blogCategories(userId: string) {
  const rows = await db.selectDistinct({ category: blogPosts.category }).from(blogPosts).where(eq(blogPosts.userId, userId))
  return rows.map((row) => row.category).filter(Boolean).sort()
}
