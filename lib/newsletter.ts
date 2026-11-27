import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterSubscribers } from '@/lib/db/schema'

/**
 * Newsletter emails go out through Resend (https://resend.com). Set in .env.local / Vercel:
 *   RESEND_API_KEY   an API key from the Resend dashboard
 *   NEWSLETTER_FROM  the sender, e.g. "The Visionary Voice <news@yourdomain.com>" (a domain verified in Resend)
 *   SITE_URL         optional; the public address used for links in emails, e.g. https://thevisionaryvoice.com
 */
const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const BATCH_SIZE = 100

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function newsletterConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.NEWSLETTER_FROM?.trim()
  return { ready: Boolean(apiKey && from), apiKey, from }
}

/** Adds (or re-subscribes) an email for the publication owned by `userId`. */
export async function addSubscriber(userId: string, email: string, sourcePage: string) {
  await db.insert(newsletterSubscribers)
    .values({ userId, email, sourcePage })
    .onConflictDoUpdate({
      target: [newsletterSubscribers.userId, newsletterSubscribers.email],
      set: { status: 'subscribed', updatedAt: sql`now()` },
    })
}

function secret() {
  const value = process.env.NEWSLETTER_SECRET || process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error('BETTER_AUTH_SECRET (or NEWSLETTER_SECRET) is required for unsubscribe links.')
  return value
}

/** A signature that proves an unsubscribe link was made by us for this email. */
export function unsubscribeToken(email: string) {
  return createHmac('sha256', secret()).update(`unsubscribe:${email.toLowerCase()}`).digest('base64url').slice(0, 32)
}

export function validUnsubscribeToken(email: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(email))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export async function unsubscribe(email: string) {
  await db.update(newsletterSubscribers)
    .set({ status: 'unsubscribed', updatedAt: new Date() })
    .where(and(eq(newsletterSubscribers.email, email.toLowerCase()), eq(newsletterSubscribers.status, 'subscribed')))
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export type Announcement = {
  /** "New magazine edition" or "New on the blog" */
  kicker: string
  title: string
  summary: string
  /** Absolute URLs. */
  url: string
  imageUrl: string | null
  action: string
}

/** The email for one subscriber: same announcement, their own unsubscribe link. */
function renderEmail(item: Announcement, unsubscribeUrl: string, siteUrl: string) {
  const html = `<!doctype html><html><body style="margin:0;background:#f8f7f3;font-family:Arial,Helvetica,sans-serif;color:#20211f">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f7f3"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e3e0d8">
<tr><td style="padding:28px 32px;border-bottom:1px solid #e3e0d8"><a href="${escape(siteUrl)}" style="text-decoration:none;color:#20211f;font-family:Georgia,serif;font-size:26px"><span style="color:#c43d2a">The</span> Visionary Voice</a></td></tr>
${item.imageUrl ? `<tr><td><a href="${escape(item.url)}"><img src="${escape(item.imageUrl)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;max-height:420px;object-fit:cover;border:0"></a></td></tr>` : ''}
<tr><td style="padding:30px 32px 8px">
<p style="margin:0 0 12px;color:#c43d2a;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase">${escape(item.kicker)}</p>
<h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:30px;font-weight:normal;line-height:1.15">${escape(item.title)}</h1>
${item.summary ? `<p style="margin:0 0 24px;color:#5b5c56;font-size:15px;line-height:1.6">${escape(item.summary)}</p>` : ''}
<a href="${escape(item.url)}" style="display:inline-block;background:#c43d2a;color:#ffffff;text-decoration:none;font-size:14px;padding:13px 22px">${escape(item.action)} &rarr;</a>
</td></tr>
<tr><td style="padding:28px 32px;color:#8a8b84;font-size:11px;line-height:1.6">You are receiving this because you subscribed to The Visionary Voice.<br><a href="${escape(unsubscribeUrl)}" style="color:#8a8b84">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`
  const text = `${item.kicker.toUpperCase()}\n\n${item.title}\n\n${item.summary ? `${item.summary}\n\n` : ''}${item.action}: ${item.url}\n\n—\nThe Visionary Voice\nUnsubscribe: ${unsubscribeUrl}`
  return { html, text }
}

/**
 * Sends the announcement to every address, one email each (so each has its own unsubscribe
 * link), in batches of 100. Returns how many were accepted and how many failed.
 */
export async function sendAnnouncement(item: Announcement, emails: string[], siteUrl: string) {
  const { ready, apiKey, from } = newsletterConfig()
  if (!ready) throw new Error('Email sending is not set up. Add RESEND_API_KEY and NEWSLETTER_FROM to the environment.')
  let sent = 0
  let failed = 0
  let lastError = ''
  for (let index = 0; index < emails.length; index += BATCH_SIZE) {
    const batch = emails.slice(index, index + BATCH_SIZE).map((email) => {
      const unsubscribeUrl = `${siteUrl}/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`
      const oneClickUrl = `${siteUrl}/api/newsletter/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`
      return {
        from,
        to: [email],
        subject: `${item.kicker}: ${item.title}`,
        ...renderEmail(item, unsubscribeUrl, siteUrl),
        // Lets mail apps show their own "Unsubscribe" button (one click, RFC 8058).
        headers: { 'List-Unsubscribe': `<${oneClickUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }
    })
    const response = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'User-Agent': 'the-visionary-voice/1.0' },
      body: JSON.stringify(batch),
    })
    if (response.ok) sent += batch.length
    else {
      failed += batch.length
      const body = await response.json().catch(() => null) as { message?: string } | null
      lastError = body?.message ?? `Resend returned ${response.status}.`
      console.error(`Newsletter batch failed (${response.status}):`, lastError)
      // A bad key or sender fails every batch the same way: stop instead of repeating it.
      if (response.status === 401 || response.status === 403 || response.status === 422) {
        failed += Math.max(0, emails.length - index - BATCH_SIZE)
        break
      }
    }
    // Stay well under Resend's rate limit between batches.
    if (index + BATCH_SIZE < emails.length) await new Promise((resolve) => setTimeout(resolve, 600))
  }
  return { sent, failed, lastError }
}
