import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { blogPosts } from '@/lib/db/schema'
import { plainText, readingMinutes } from '@/components/blog/blog-content'

/** What the public blog pages show for a post. */
export type PublicBlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  /** Cover image URL, or null when the post has none. */
  image: string | null
  /** e.g. "27 November 2026" */
  date: string
  isoDate: string
  minutes: number
}

type BlogRow = typeof blogPosts.$inferSelect

/**
 * URL of a post's cover; `v` (the stored file name) changes when the cover is replaced.
 * A cover that is a site image (e.g. the demo posts' "/cover-man-blue.png") is used as is.
 */
export function blogCoverUrl(post: Pick<BlogRow, 'id' | 'coverUrl'>) {
  if (post.coverUrl?.startsWith('/') && !post.coverUrl.startsWith('//')) return post.coverUrl
  return post.coverUrl ? `/api/blog-assets?id=${encodeURIComponent(post.id)}&v=${encodeURIComponent(post.coverUrl.split('/').pop() ?? '')}` : null
}

function toPublic(post: BlogRow): PublicBlogPost {
  const when = post.publishedAt ?? post.createdAt
  const excerpt = post.excerpt.trim() || (() => {
    const text = plainText(post.content)
    return text.length > 200 ? `${text.slice(0, 200).replace(/\s+\S*$/, '')}…` : text
  })()
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt,
    content: post.content,
    author: post.author,
    category: post.category,
    image: blogCoverUrl(post),
    date: when.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    isoDate: when.toISOString(),
    minutes: readingMinutes(post.content),
  }
}

export async function getPublishedPosts(): Promise<PublicBlogPost[]> {
  try {
    const rows = await db.select().from(blogPosts)
      .where(eq(blogPosts.published, true))
      .orderBy(desc(blogPosts.publishedAt), desc(blogPosts.createdAt))
    return rows.map(toPublic)
  } catch (error) {
    console.error('[blog] Unable to load published posts', error)
    return []
  }
}

export async function getPublishedPostBySlug(slug: string): Promise<PublicBlogPost | null> {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null
  const [row] = await db.select().from(blogPosts)
    .where(and(eq(blogPosts.slug, slug), eq(blogPosts.published, true)))
    .orderBy(desc(blogPosts.publishedAt))
    .limit(1)
  return row ? toPublic(row) : null
}
