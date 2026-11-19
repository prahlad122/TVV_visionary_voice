import { createHmac } from 'node:crypto'
import { and, count, eq, gte } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { analyticsEvents } from '@/lib/db/schema'
import { findAdminOwnerId } from '@/lib/admin-owner'

const sessionCookie = 'vv_analytics_session'
const consentCookie = 'vv_analytics_consent'
const maxPerMinute = 60
const safeTag = (value: unknown) => typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9 _.-]/g, '').slice(0, 100) : ''

function visitorHash(id: string) {
  const key = process.env.BETTER_AUTH_SECRET
  if (!key) throw new Error('Analytics signing key is unavailable.')
  return createHmac('sha256', key).update(id).digest('hex')
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  if (cookieStore.get(consentCookie)?.value !== 'accepted') return new NextResponse(null, { status: 204 })

  const body = await request.json().catch(() => null) as null | {
    pagePath?: unknown
    referrer?: unknown
    utmSource?: unknown
    utmMedium?: unknown
    utmCampaign?: unknown
  }
  const pagePath = typeof body?.pagePath === 'string' ? body.pagePath : ''
  if (!pagePath.startsWith('/') || pagePath.startsWith('//') || pagePath.length > 500 || pagePath.includes('?')) {
    return NextResponse.json({ error: 'Invalid page path' }, { status: 400 })
  }

  let referrerHost = ''
  if (typeof body?.referrer === 'string' && body.referrer.length < 2048) {
    try {
      const host = new URL(body.referrer).hostname.toLowerCase()
      referrerHost = host === request.nextUrl.hostname.toLowerCase() ? '' : host.slice(0, 255)
    } catch { referrerHost = '' }
  }

  const ownerId = await findAdminOwnerId()
  if (!ownerId) return new NextResponse(null, { status: 204 })
  let sessionId = cookieStore.get(sessionCookie)?.value
  const newSession = !sessionId
  if (!sessionId) sessionId = crypto.randomUUID()
  const sessionHash = visitorHash(sessionId)
  const minuteAgo = new Date(Date.now() - 60_000)
  const [recent] = await db.select({ total: count() }).from(analyticsEvents)
    .where(and(eq(analyticsEvents.userId, ownerId), eq(analyticsEvents.sessionHash, sessionHash), gte(analyticsEvents.createdAt, minuteAgo)))
  if (Number(recent?.total ?? 0) < maxPerMinute) {
    const userAgent = request.headers.get('user-agent')?.toLowerCase() ?? ''
    const deviceClass = /tablet|ipad/.test(userAgent) ? 'tablet' : /mobile|android|iphone/.test(userAgent) ? 'mobile' : 'desktop'
    await db.insert(analyticsEvents).values({
      userId: ownerId,
      sessionHash,
      eventType: 'page_view',
      pagePath,
      referrerHost,
      utmSource: safeTag(body?.utmSource),
      utmMedium: safeTag(body?.utmMedium),
      utmCampaign: safeTag(body?.utmCampaign),
      deviceClass,
    })
  }

  const response = NextResponse.json({ accepted: true }, { status: 202 })
  if (newSession) response.cookies.set(sessionCookie, sessionId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
