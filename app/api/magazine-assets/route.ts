import { getObject } from '@/lib/storage'
import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { magazineIssues } from '@/lib/db/schema'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const id = params.get('id') ?? ''
  const asset = params.get('asset') ?? ''
  if (!/^[a-zA-Z0-9-]{20,50}$/.test(id) || !['issue', 'cover', 'page'].includes(asset)) return notFound()

  // Only the columns needed to locate the file; this runs for every page image and PDF range request.
  const [issue] = await db.select({
    userId: magazineIssues.userId,
    published: magazineIssues.published,
    coverUrl: magazineIssues.coverUrl,
    fileUrl: magazineIssues.fileUrl,
    pageImages: magazineIssues.pageImages,
  }).from(magazineIssues).where(eq(magazineIssues.id, id)).limit(1)
  if (!issue) return notFound()
  if (!issue.published) {
    const admin = await getAdminUser()
    if (!admin || admin.id !== issue.userId) return notFound()
  }

  let pathname: string | null | undefined
  if (asset === 'page') {
    const pageNumber = Number(params.get('n'))
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return notFound()
    pathname = issue.pageImages[pageNumber - 1]?.path
  } else {
    pathname = asset === 'cover' ? issue.coverUrl : issue.fileUrl
  }
  if (!pathname || !pathname.startsWith(`magazines/${issue.userId}/${id}/`) || pathname.includes('..')) return notFound()

  try {
    const range = asset === 'issue' ? request.headers.get('range') : null
    const result = await getObject(pathname, range)
    if (!result) return notFound()
    // Page image URLs carry a version (`v`) that changes whenever pages are re-rendered,
    // so published pages can be cached by the browser for a long time.
    const cacheControl = !issue.published
      ? 'private, no-store'
      : asset === 'page' && params.get('v')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, s-maxage=60'
    const headers = new Headers({
      'Content-Type': result.contentType ?? 'application/octet-stream',
      'Cache-Control': cacheControl,
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    })
    if (result.etag) headers.set('ETag', result.etag)
    // Preserve range response metadata so PDF.js can fetch only the pages and
    // byte ranges it needs instead of buffering a potentially 400 MB PDF.
    if (result.contentLength !== undefined) headers.set('Content-Length', String(result.contentLength))
    if (result.contentRange) headers.set('Content-Range', result.contentRange)
    if (asset === 'issue') {
      const disposition = params.get('download') === '1' ? 'attachment' : 'inline'
      headers.set('Content-Disposition', `${disposition}; filename="magazine-issue.pdf"`)
    }
    const status = range && result.contentRange ? 206 : 200
    return new NextResponse(result.stream, { headers, status })
  } catch (error) {
    console.error(`Storage read failed for issue ${id} (${asset}):`, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Unable to retrieve magazine file.' }, { status: 500 })
  }
}
