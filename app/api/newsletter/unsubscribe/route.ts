import { NextResponse, type NextRequest } from 'next/server'
import { unsubscribe, validUnsubscribeToken } from '@/lib/newsletter'

/**
 * One-click unsubscribe (RFC 8058): mail apps POST here from their own "Unsubscribe" button,
 * using the List-Unsubscribe header in each newsletter email.
 */
export async function POST(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('e')?.trim().toLowerCase() ?? ''
  const token = request.nextUrl.searchParams.get('t') ?? ''
  if (!email || !token || !validUnsubscribeToken(email, token)) return NextResponse.json({ error: 'Invalid link.' }, { status: 400 })
  await unsubscribe(email)
  return NextResponse.json({ ok: true })
}

// Opening the link in a browser goes to the confirmation page instead of unsubscribing at once
// (link scanners in mail systems open links and must not unsubscribe people).
export function GET(request: NextRequest) {
  const url = new URL('/newsletter/unsubscribe', request.url)
  url.search = request.nextUrl.search
  return NextResponse.redirect(url)
}
