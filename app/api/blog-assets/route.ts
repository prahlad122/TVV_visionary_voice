import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { blogPosts } from '@/lib/db/schema'
import { getObject } from '@/lib/storage'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

/**
 * Serves a blog post's cover image from the private R2 bucket. Covers of published posts are
 * public; a draft's cover is only shown to the admin who owns it (for the editor's preview).
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!/^[a-zA-Z0-9-]{20,50}$/.test(id)) return notFound()

  const [post] = await db.select({ userId: blogPosts.userId, published: blogPosts.published, coverUrl: blogPosts.coverUrl })
    .from(blogPosts).where(eq(blogPosts.id, id)).limit(1)
  if (!post?.coverUrl) return notFound()
  if (!post.published) {
    const admin = await getAdminUser()
    if (!admin || admin.id !== post.userId) return notFound()
  }
  if (!post.coverUrl.startsWith(`blog/${post.userId}/${id}/`) || post.coverUrl.includes('..')) return notFound()

  try {
    const result = await getObject(post.coverUrl)
    if (!result) return notFound()
    const headers = new Headers({
      'Content-Type': result.contentType ?? 'application/octet-stream',
      // The URL carries the stored file name (`v`), so a replaced cover gets a new URL.
      'Cache-Control': !post.published ? 'private, no-store' : request.nextUrl.searchParams.get('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, s-maxage=60',
      'X-Content-Type-Options': 'nosniff',
    })
    if (result.contentLength !== undefined) headers.set('Content-Length', String(result.contentLength))
    if (result.etag) headers.set('ETag', result.etag)
    return new NextResponse(result.stream, { headers })
  } catch (error) {
    console.error(`Storage read failed for blog post ${id} cover:`, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to retrieve the image.' }, { status: 500 })
  }
}
