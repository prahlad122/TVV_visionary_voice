'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireAdminAction } from '@/lib/admin-auth'
import { getPublishedPosts } from '@/lib/blog'
import { db } from '@/lib/db'
import { magazineIssues, newsletterSends, newsletterSubscribers } from '@/lib/db/schema'
import { sendAnnouncement, type Announcement } from '@/lib/newsletter'
import { getPublishedIssueById } from '@/lib/public-content'

const idPattern = /^[a-zA-Z0-9-]{20,50}$/

/** The public address for links in emails: SITE_URL when set, otherwise the address the admin is using. */
async function siteUrl() {
  const configured = process.env.SITE_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  const list = await headers()
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000'
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https')
  return `${proto}://${host}`
}

const absolute = (base: string, path: string | null) => !path ? null : /^https?:\/\//.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`

export type SendResult = { sent: number; failed: number; error?: string }

/**
 * Emails every current subscriber about one published magazine issue or blog post: the
 * "Email subscribers" button in the admin portal.
 */
export async function sendNewsletter(kind: 'issue' | 'post', id: string): Promise<SendResult> {
  const admin = await requireAdminAction()
  if ((kind !== 'issue' && kind !== 'post') || !idPattern.test(id)) return { sent: 0, failed: 0, error: 'Invalid item.' }
  const base = await siteUrl()

  let item: Announcement
  if (kind === 'issue') {
    const [owned] = await db.select({ id: magazineIssues.id }).from(magazineIssues)
      .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id), eq(magazineIssues.published, true))).limit(1)
    const issue = owned ? await getPublishedIssueById(id) : null
    if (!issue) return { sent: 0, failed: 0, error: 'Publish the issue before emailing it to subscribers.' }
    item = {
      kicker: 'New magazine edition',
      title: issue.title,
      summary: issue.description || `A new ${issue.industry ? `${issue.industry.toLowerCase()} ` : ''}edition from The Visionary Voice${issue.date ? `, ${issue.date}` : ''}.`,
      url: `${base}/read/${encodeURIComponent(issue.id)}`,
      imageUrl: absolute(base, issue.image),
      action: 'Read the issue',
    }
  } else {
    const post = (await getPublishedPosts()).find((candidate) => candidate.id === id)
    if (!post) return { sent: 0, failed: 0, error: 'Publish the post before emailing it to subscribers.' }
    item = {
      kicker: 'New on the blog',
      title: post.title,
      summary: post.excerpt,
      url: `${base}/blog/${post.slug}`,
      imageUrl: absolute(base, post.image),
      action: 'Read the post',
    }
  }

  const subscribers = await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers)
    .where(and(eq(newsletterSubscribers.userId, admin.id), eq(newsletterSubscribers.status, 'subscribed')))
  if (!subscribers.length) return { sent: 0, failed: 0, error: 'There are no subscribers yet.' }

  // Problems are returned, not thrown: Next.js hides thrown messages from the browser in production.
  let result: Awaited<ReturnType<typeof sendAnnouncement>>
  try {
    result = await sendAnnouncement(item, subscribers.map((row) => row.email), base)
  } catch (error) {
    return { sent: 0, failed: 0, error: error instanceof Error ? error.message : 'The emails could not be sent.' }
  }
  if (!result.sent) return { sent: 0, failed: result.failed, error: result.lastError || 'The emails could not be sent.' }
  await db.insert(newsletterSends).values({ userId: admin.id, kind, itemId: id, title: item.title, recipients: result.sent, failed: result.failed })
  revalidatePath('/admin')
  return { sent: result.sent, failed: result.failed, ...(result.failed ? { error: result.lastError } : {}) }
}

/** Removes someone from the list (kept as unsubscribed, so they are never emailed by accident). */
export async function removeSubscriber(id: string) {
  const admin = await requireAdminAction()
  if (!idPattern.test(id)) throw new Error('Invalid subscriber.')
  await db.update(newsletterSubscribers).set({ status: 'unsubscribed', updatedAt: new Date() })
    .where(and(eq(newsletterSubscribers.id, id), eq(newsletterSubscribers.userId, admin.id)))
  revalidatePath('/admin')
}
