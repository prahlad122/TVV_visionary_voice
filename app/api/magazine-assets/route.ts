import { get } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { magazineIssues } from '@/lib/db/schema'

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? ''
  const asset = request.nextUrl.searchParams.get('asset')
  if (!/^[a-zA-Z0-9-]{20,50}$/.test(id) || !['issue', 'cover'].includes(asset ?? '')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [issue] = await db.select().from(magazineIssues).where(eq(magazineIssues.id, id)).limit(1)
  if (!issue) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!issue.published) {
    const admin = await getAdminUser()
    if (!admin || admin.id !== issue.userId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pathname = asset === 'cover' ? issue.coverUrl : issue.fileUrl
  if (!pathname || !pathname.startsWith(`magazines/${issue.userId}/${issue.id}/`) || pathname.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    const result = await get(pathname, { access: 'private' })
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const headers = new Headers({
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      'Cache-Control': issue.published ? 'public, max-age=0, s-maxage=60' : 'private, no-store',
      ETag: result.blob.etag,
      'X-Content-Type-Options': 'nosniff',
    })
    if (asset === 'issue') {
      const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
      headers.set('Content-Disposition', `${disposition}; filename="magazine-issue.pdf"`)
    }
    return new NextResponse(result.stream, { headers })
  } catch {
    return NextResponse.json({ error: 'Unable to retrieve magazine file.' }, { status: 500 })
  }
}
