import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'

const issueIdPattern = /^[a-zA-Z0-9-]{20,50}$/

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as HandleUploadBody | null
  if (!body) return NextResponse.json({ error: 'Invalid upload request.' }, { status: 400 })

  try {
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const admin = await getAdminUser()
        if (!admin) throw new Error('Unauthorized')
        let payload: { issueId?: string; assetType?: string }
        try { payload = JSON.parse(clientPayload ?? '{}') as { issueId?: string; assetType?: string } } catch { throw new Error('Invalid upload metadata.') }
        if (!payload.issueId || !issueIdPattern.test(payload.issueId) || !['issue', 'cover'].includes(payload.assetType ?? '')) {
          throw new Error('Invalid upload metadata.')
        }
        const basePath = `magazines/${admin.id}/${payload.issueId}/`
        if (!pathname.startsWith(basePath)) throw new Error('Invalid upload path.')
        const isCover = payload.assetType === 'cover'
        return {
          access: 'private',
          addRandomSuffix: true,
          allowedContentTypes: isCover ? ['image/jpeg', 'image/png', 'image/webp'] : ['application/pdf'],
          maximumSizeInBytes: isCover ? 8 * 1024 * 1024 : 250 * 1024 * 1024,
          tokenPayload: JSON.stringify({ userId: admin.id, issueId: payload.issueId, assetType: payload.assetType }),
        }
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload || !blob.pathname.startsWith('magazines/')) throw new Error('Invalid completed upload.')
      },
    })
    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 400 })
  }
}
