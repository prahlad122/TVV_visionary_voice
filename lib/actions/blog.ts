'use server'

import { and, eq, ne } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdminAction } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { blogPosts } from '@/lib/db/schema'
import { deleteObjects } from '@/lib/storage'

const postIdPattern = /^[a-zA-Z0-9-]{20,50}$/
const MAX_CONTENT_CHARS = 200_000

export type BlogPostInput = {
  id: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  /** R2 key of a newly uploaded cover, `null` to remove the cover, or `undefined` to keep it. */
  coverUrl?: string | null
  published: boolean
}

function slugify(title: string) {
  const slug = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')
  return slug || 'post'
}

/** The title's slug, with -2, -3… added if another of this admin's posts already uses it. */
async function uniqueSlug(userId: string, postId: string, title: string) {
  const base = slugify(title)
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const [taken] = await db.select({ id: blogPosts.id }).from(blogPosts)
      .where(and(eq(blogPosts.userId, userId), eq(blogPosts.slug, candidate), ne(blogPosts.id, postId))).limit(1)
    if (!taken) return candidate
  }
  return `${base}-${postId.slice(0, 8)}`
}

function clean(value: unknown, max: number, label: string) {
  if (typeof value !== 'string') throw new Error(`Invalid ${label}.`)
  const text = value.trim()
  if (text.length > max) throw new Error(`The ${label} must be ${max.toLocaleString('en-US')} characters or fewer.`)
  return text
}

function revalidateBlog(slug?: string) {
  revalidatePath('/admin')
  revalidatePath('/blog')
  if (slug) revalidatePath(`/blog/${slug}`)
}

/** Create or update a post. Returns its id and public address. */
export async function saveBlogPost(input: BlogPostInput) {
  const admin = await requireAdminAction()
  if (!postIdPattern.test(input.id)) throw new Error('Invalid post.')
  const title = clean(input.title, 160, 'title')
  if (!title) throw new Error('Give the post a title.')
  const excerpt = clean(input.excerpt, 400, 'summary')
  const content = clean(input.content, MAX_CONTENT_CHARS, 'post')
  const author = clean(input.author, 120, 'author name')
  const category = clean(input.category, 60, 'category')
  if (input.published && !content) throw new Error('Write the post before publishing it.')
  if (input.coverUrl && (!input.coverUrl.startsWith(`blog/${admin.id}/${input.id}/`) || input.coverUrl.includes('..'))) throw new Error('Invalid cover image.')

  const [existing] = await db.select().from(blogPosts)
    .where(and(eq(blogPosts.id, input.id), eq(blogPosts.userId, admin.id))).limit(1)
  // Once a post has been published its address stays the same, so shared links keep working.
  const slug = existing?.publishedAt ? existing.slug : await uniqueSlug(admin.id, input.id, title)
  const now = new Date()
  const values = {
    title, excerpt, content, author, category, slug,
    published: input.published,
    publishedAt: existing?.publishedAt ?? (input.published ? now : null),
    updatedAt: now,
    ...(input.coverUrl !== undefined ? { coverUrl: input.coverUrl } : {}),
  }

  if (existing) {
    await db.update(blogPosts).set(values).where(and(eq(blogPosts.id, input.id), eq(blogPosts.userId, admin.id)))
    // The replaced (or removed) cover is no longer used anywhere.
    if (input.coverUrl !== undefined && existing.coverUrl?.startsWith('blog/') && existing.coverUrl !== input.coverUrl) {
      await deleteObjects([existing.coverUrl]).catch((error) => console.error('Could not delete the old blog cover:', error))
    }
    if (existing.slug !== slug) revalidatePath(`/blog/${existing.slug}`)
  } else {
    await db.insert(blogPosts).values({ id: input.id, userId: admin.id, coverUrl: input.coverUrl ?? null, ...values })
  }
  revalidateBlog(slug)
  return { id: input.id, slug }
}

export async function setBlogPostPublished(id: string, published: boolean) {
  const admin = await requireAdminAction()
  if (!postIdPattern.test(id)) throw new Error('Invalid post.')
  const [post] = await db.select().from(blogPosts).where(and(eq(blogPosts.id, id), eq(blogPosts.userId, admin.id))).limit(1)
  if (!post) throw new Error('Post not found.')
  if (published && !post.content.trim()) throw new Error('Write the post before publishing it.')
  await db.update(blogPosts)
    .set({ published, publishedAt: post.publishedAt ?? (published ? new Date() : null), updatedAt: new Date() })
    .where(eq(blogPosts.id, id))
  revalidateBlog(post.slug)
}

export async function deleteBlogPost(id: string) {
  const admin = await requireAdminAction()
  if (!postIdPattern.test(id)) throw new Error('Invalid post.')
  const [post] = await db.delete(blogPosts).where(and(eq(blogPosts.id, id), eq(blogPosts.userId, admin.id))).returning()
  if (!post) return
  // Only uploaded covers live in storage; a site image (demo posts) is left alone.
  if (post.coverUrl?.startsWith('blog/')) await deleteObjects([post.coverUrl]).catch((error) => console.error('Could not delete the blog cover:', error))
  revalidateBlog(post.slug)
}
