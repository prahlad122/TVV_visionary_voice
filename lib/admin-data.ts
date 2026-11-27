import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { analyticsEvents, blogPosts, cmsPages, crmContacts, magazineIssues, newsletterSends, newsletterSubscribers } from '@/lib/db/schema'
import { newsletterConfig } from '@/lib/newsletter'
import { plainText } from '@/components/blog/blog-content'
import { blogCoverUrl } from '@/lib/blog'
import { defaultPageCopy } from '@/lib/public-content'

export async function getAdminDashboardData(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [contacts, issues, posts, subscribers, sends, savedPages, totals, topSources, topPages, devices, recentEvents] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).orderBy(desc(crmContacts.createdAt)),
    db.select().from(magazineIssues).where(eq(magazineIssues.userId, userId)).orderBy(desc(magazineIssues.createdAt)).limit(100),
    db.select().from(blogPosts).where(eq(blogPosts.userId, userId)).orderBy(desc(blogPosts.updatedAt)).limit(200),
    db.select().from(newsletterSubscribers).where(eq(newsletterSubscribers.userId, userId)).orderBy(desc(newsletterSubscribers.createdAt)).limit(2000),
    db.select().from(newsletterSends).where(eq(newsletterSends.userId, userId)).orderBy(desc(newsletterSends.sentAt)).limit(200),
    db.select().from(cmsPages).where(eq(cmsPages.userId, userId)).orderBy(desc(cmsPages.updatedAt)),
    db.select({
      views: count(),
      visitors: sql<number>`count(distinct ${analyticsEvents.sessionHash})`,
      sessions: sql<number>`count(distinct ${analyticsEvents.sessionHash})`,
    }).from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), gte(analyticsEvents.createdAt, since))),
    db.select({ source: analyticsEvents.utmSource, medium: analyticsEvents.utmMedium, campaign: analyticsEvents.utmCampaign, referrer: analyticsEvents.referrerHost, views: count() })
      .from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), gte(analyticsEvents.createdAt, since)))
      .groupBy(analyticsEvents.utmSource, analyticsEvents.utmMedium, analyticsEvents.utmCampaign, analyticsEvents.referrerHost).orderBy(desc(count())).limit(8),
    db.select({ path: analyticsEvents.pagePath, views: count() })
      .from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), gte(analyticsEvents.createdAt, since)))
      .groupBy(analyticsEvents.pagePath).orderBy(desc(count())).limit(8),
    db.select({ device: analyticsEvents.deviceClass, views: count() })
      .from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), gte(analyticsEvents.createdAt, since)))
      .groupBy(analyticsEvents.deviceClass).orderBy(desc(count())),
    db.select({ eventType: analyticsEvents.eventType, path: analyticsEvents.pagePath, source: analyticsEvents.utmSource, referrer: analyticsEvents.referrerHost, createdAt: analyticsEvents.createdAt })
      .from(analyticsEvents).where(and(eq(analyticsEvents.userId, userId), gte(analyticsEvents.createdAt, since)))
      .orderBy(desc(analyticsEvents.createdAt)).limit(12),
  ])

  const pageBySlug = new Map(savedPages.map((page) => [page.slug, page]))
  const pages = Object.entries(defaultPageCopy).map(([slug, defaults]) => {
    const saved = pageBySlug.get(slug)
    return {
      slug,
      title: saved?.title ?? slug[0].toUpperCase() + slug.slice(1),
      content: { ...defaults, ...(saved?.content ?? {}) },
      published: saved?.published ?? false,
    }
  })

  return {
    contacts: contacts.map((contact) => ({ ...contact, createdAt: contact.createdAt.toISOString() })),
    issues: issues.map((issue) => ({ ...issue, createdAt: issue.createdAt.toISOString(), issueDate: issue.issueDate ?? '' })),
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      category: post.category,
      author: post.author,
      coverSrc: blogCoverUrl(post),
      published: post.published,
      publishedAt: post.publishedAt?.toISOString() ?? null,
      updatedAt: post.updatedAt.toISOString(),
      words: plainText(post.content).split(' ').filter(Boolean).length,
    })),
    newsletter: {
      ready: newsletterConfig().ready,
      from: process.env.NEWSLETTER_FROM?.trim() || null,
      subscribers: subscribers.map((row) => ({ id: row.id, email: row.email, status: row.status, sourcePage: row.sourcePage, createdAt: row.createdAt.toISOString() })),
      sends: sends.map((row) => ({ id: row.id, kind: row.kind, itemId: row.itemId, title: row.title, recipients: row.recipients, failed: row.failed, sentAt: row.sentAt.toISOString() })),
    },
    pages,
    analytics: {
      views: Number(totals[0]?.views ?? 0),
      visitors: Number(totals[0]?.visitors ?? 0),
      sessions: Number(totals[0]?.sessions ?? 0),
      topSources,
      topPages,
      devices,
      recentEvents: recentEvents.map((event) => ({ ...event, createdAt: event.createdAt.toISOString() })),
    },
  }
}
