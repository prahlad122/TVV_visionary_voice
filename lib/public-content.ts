import { desc, eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { cmsPages, magazineIssues } from '@/lib/db/schema'
import { issues as fallbackIssues, type Issue } from '@/components/magazine/issue-cover'

export type PageCopy = Record<string, string>

export const defaultPageCopy: Record<string, PageCopy> = {
  home: {
    heroTitle: 'The people behind what comes next.',
    heroDescription: 'Fresh perspectives on business, through the leaders and organizations shaping it. Explore the world of The Visionary Voice, one edition at a time.',
    leadTitle: 'Top 10 CEOs Inspiring the Business World 2022',
    leadDescription: 'Featuring Agustin Correa and leadership perspectives on analytical thinking, business insight and meaningful organizational change.',
  },
  magazine: {
    heroTitle: 'Ideas worth turning to.',
    heroDescription: 'Explore our digital and web magazines. Leadership viewpoints, expert commentary and the people moving industries forward.',
    featuredTitle: 'Top 10 CEOs Inspiring the Business World 2022',
    featuredDescription: 'Discover our leadership editions and the business voices featured on the original covers.',
  },
  about: {
    heroTitle: 'A wider lens on business.',
    heroStatement: 'Every organization has a story. Every leader, a perspective.',
    intro: 'The Visionary Voice is a global business magazine publisher bringing those perspectives to light. Our digital and web magazines explore the people, decisions and ideas shaping the business world.',
    missionTitle: 'To put meaningful business stories in focus.',
    missionDescription: 'We spotlight leaders and innovative organizations to explore not only what they do, but how they think. Our aim is to make room for ideas that inform, challenge assumptions and offer a fresh point of view.',
  },
}

export async function getPublishedPageCopy(slug: string): Promise<PageCopy> {
  try {
    const [page] = await db.select({ content: cmsPages.content })
      .from(cmsPages)
      .where(and(eq(cmsPages.slug, slug), eq(cmsPages.published, true)))
      .orderBy(desc(cmsPages.updatedAt))
      .limit(1)
    if (page?.content && Object.keys(page.content).length > 0) return { ...(defaultPageCopy[slug] ?? {}), ...page.content }
  } catch (error) {
    console.error('[cms] Unable to load published page copy', error)
  }
  return defaultPageCopy[slug] ?? {}
}

export async function getPublishedIssueById(id: string): Promise<Issue | null> {
  const allIssues = await getPublishedIssues()
  return allIssues.find((issue) => issue.id === id) ?? null
}

export async function getPublishedIssues(): Promise<Issue[]> {
  try {
    const rows = await db.select().from(magazineIssues)
      .where(eq(magazineIssues.published, true))
      .orderBy(desc(magazineIssues.featured), desc(magazineIssues.issueDate), desc(magazineIssues.createdAt))
    const uploadedIssues = rows.map((issue) => ({
        id: issue.id,
        title: issue.title,
        description: issue.description,
        articleText: issue.articleText,
        summary: issue.summaryStatus === 'ready' ? issue.summary : '',
        pages: issue.pageImages.map((image, index) => ({
          // `v` is the stored file name: it changes when pages are re-rendered, so the URL can be cached forever.
          url: `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=page&n=${index + 1}&v=${encodeURIComponent(image.path.split('/').pop() ?? '')}`,
          width: image.width,
          height: image.height,
        })),
        date: issue.issueDate ? new Date(`${issue.issueDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : issue.createdAt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        region: issue.region,
        industry: issue.industry,
        // `v` is the stored file name, so a replaced cover gets a new URL instead of a cached old image.
        image: issue.coverUrl ? `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=cover&v=${encodeURIComponent(issue.coverUrl.split('/').pop() ?? '')}` : '/cover-woman-blue.png',
        coverLabel: issue.industry || 'Leadership edition',
        coverName: issue.title.split(/\s+/).slice(0, 4).join(' '),
        fileUrl: issue.fileUrl ? `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=issue` : undefined,
        featured: issue.featured,
      }))
    // Keep the bundled editorial collection visible when an admin publishes
    // managed issues. Uploaded issues are listed first, while matching IDs
    // are only shown once.
    const uploadedIds = new Set(uploadedIssues.map((issue) => issue.id))
    return [...uploadedIssues, ...fallbackIssues.filter((issue) => !uploadedIds.has(issue.id))]
  } catch (error) {
    // Public pages have a bundled fallback issue list so a missing/unavailable
    // database does not need to become a full-screen Next.js development error.
    console.warn('[cms] Unable to load published magazine issues; using fallback content.', error instanceof Error ? error.message : error)
  }
  return fallbackIssues
}
