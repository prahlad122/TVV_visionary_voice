import { and, eq, gte } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { crmContacts } from '@/lib/db/schema'
import { findAdminOwnerId } from '@/lib/admin-owner'
import { addSubscriber } from '@/lib/newsletter'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as null | {
    name?: unknown
    email?: unknown
    company?: unknown
    sourcePage?: unknown
    referrer?: unknown
    emailConsent?: unknown
    website?: unknown
  }
  if (!body || typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true })

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Newsletter subscriber'
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const company = typeof body.company === 'string' ? body.company.trim().slice(0, 160) : ''
  const sourcePage = typeof body.sourcePage === 'string' && body.sourcePage.startsWith('/') && !body.sourcePage.startsWith('//') ? body.sourcePage.slice(0, 300) : '/'
  if (!emailPattern.test(email) || body.emailConsent !== true) {
    return NextResponse.json({ error: 'Enter a valid name and email, and confirm email consent.' }, { status: 400 })
  }

  let referrerHost = ''
  if (typeof body.referrer === 'string' && body.referrer.length < 2048) {
    try { referrerHost = new URL(body.referrer).hostname.toLowerCase().slice(0, 255) } catch { referrerHost = '' }
  }
  const ownerId = await findAdminOwnerId()
  if (!ownerId) return NextResponse.json({ error: 'Subscriptions are temporarily unavailable.' }, { status: 503 })

  const duplicateSince = new Date(Date.now() - 60 * 60 * 1000)
  const [duplicate] = await db.select({ id: crmContacts.id }).from(crmContacts)
    .where(and(eq(crmContacts.userId, ownerId), eq(crmContacts.email, email), gte(crmContacts.createdAt, duplicateSince)))
    .limit(1)
  if (!duplicate) {
    await db.insert(crmContacts).values({
      userId: ownerId,
      name,
      email,
      company,
      source: 'newsletter',
      sourcePage,
      referrerHost,
      status: 'new',
      emailConsent: true,
    })
  }
  // Every sign-up here asked for new-edition emails (consent is required above).
  await addSubscriber(ownerId, email, sourcePage)
  return NextResponse.json({ ok: true }, { status: 201 })
}
