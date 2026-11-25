import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/admin-auth'
import { createUploadUrl } from '@/lib/storage'

const issueIdPattern = /^[a-zA-Z0-9-]{20,50}$/
const MB = 1024 * 1024

// What each kind of upload may be called, which types it may have, and how large it may be.
const rules = {
  issue: { prefix: /^issue-[\w.-]+\.pdf$/i, types: ['application/pdf'], maxBytes: 400 * MB },
  cover: { prefix: /^cover-[\w.-]+\.(jpe?g|png|webp)$/i, types: ['image/jpeg', 'image/png', 'image/webp'], maxBytes: 8 * MB },
  page: { prefix: /^pages\/page-\d{4}\.(webp|jpg)$/, types: ['image/webp', 'image/jpeg'], maxBytes: 8 * MB },
} as const

type UploadRequest = { issueId?: unknown; assetType?: unknown; filename?: unknown; contentType?: unknown; size?: unknown }

/**
 * Signs a one-hour PUT URL so the admin's browser can upload a file straight to
 * Cloudflare R2. The object key is built here, under the admin's own folder for
 * the issue, with a random suffix so a replaced file never reuses a cached URL.
 */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as UploadRequest | null
  const assetType = typeof body?.assetType === 'string' && body.assetType in rules ? body.assetType as keyof typeof rules : null
  const issueId = typeof body?.issueId === 'string' ? body.issueId : ''
  const filename = typeof body?.filename === 'string' ? body.filename : ''
  const contentType = typeof body?.contentType === 'string' ? body.contentType : ''
  const size = typeof body?.size === 'number' ? body.size : -1
  if (!assetType || !issueIdPattern.test(issueId)) return NextResponse.json({ error: 'Invalid upload metadata.' }, { status: 400 })

  const rule = rules[assetType]
  if (!rule.prefix.test(filename) || filename.includes('..')) return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 })
  if (!(rule.types as readonly string[]).includes(contentType)) return NextResponse.json({ error: 'This file type is not allowed.' }, { status: 400 })
  if (size <= 0 || size > rule.maxBytes) return NextResponse.json({ error: `Files of this kind must be at most ${rule.maxBytes / MB} MB.` }, { status: 400 })

  const dot = filename.lastIndexOf('.')
  const key = `magazines/${admin.id}/${issueId}/${filename.slice(0, dot)}-${randomBytes(6).toString('hex')}${filename.slice(dot)}`
  try {
    return NextResponse.json({ url: await createUploadUrl(key, contentType), key })
  } catch (error) {
    console.error('Could not sign an R2 upload:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'File storage is not configured correctly.' }, { status: 500 })
  }
}
