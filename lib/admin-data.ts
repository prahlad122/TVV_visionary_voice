import { and, count, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { analyticsEvents, cmsPages, crmContacts, magazineIssues } from '@/lib/db/schema'
import { defaultPageCopy } from '@/lib/public-content'

export async function getAdminDashboardData(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const [contacts, issues, savedPages, totals, topSources, topPages, devices, recentEvents] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.userId, userId)).orderBy(desc(crmContacts.createdAt)),
    db.select().from(magazineIssues).where(eq(magazineIssues.userId, userId)).orderBy(desc(magazineIssues.createdAt)).limit(100),
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
