import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { BlogEditor } from '@/components/admin/blog-editor'
import { requireAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { blogPosts } from '@/lib/db/schema'
import { blogCategories } from '@/lib/blog-admin'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit blog post | The Visionary Voice', robots: { index: false, follow: false } }

export default async function EditBlogPostPage(props: PageProps<'/admin/blog/[id]/edit'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  if (!/^[a-zA-Z0-9-]{20,50}$/.test(id)) notFound()
  const [post] = await db.select().from(blogPosts).where(and(eq(blogPosts.id, id), eq(blogPosts.userId, admin.id))).limit(1)
  if (!post) notFound()
  return <BlogEditor
    isNew={false}
    categories={await blogCategories(admin.id)}
    post={{ id: post.id, title: post.title, excerpt: post.excerpt, content: post.content, author: post.author, category: post.category, coverUrl: post.coverUrl, slug: post.slug, published: post.published, updatedAt: post.updatedAt.toISOString() }}
  />
}
