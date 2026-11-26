import { and, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { EditIssueForm } from '@/components/admin/edit-issue-form'
import { requireAdmin } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { magazineIssues } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Edit magazine | The Visionary Voice', robots: { index: false, follow: false } }
// Saving a replacement PDF starts its AI summary in the background (see after() in lib/actions/admin.ts).
export const maxDuration = 300

export default async function EditIssuePage(props: PageProps<'/admin/issues/[id]/edit'>) {
  const admin = await requireAdmin()
  const { id } = await props.params
  if (!/^[a-zA-Z0-9-]{20,50}$/.test(id)) notFound()
  const [issue] = await db.select().from(magazineIssues)
    .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
    .limit(1)
  if (!issue) notFound()

  return <EditIssueForm
    userId={admin.id}
    issue={{
      id: issue.id,
      title: issue.title,
      description: issue.description,
      industry: issue.industry,
      region: issue.region,
      issueDate: issue.issueDate ?? '',
      articleText: issue.articleText,
      summary: issue.summary,
      summaryStatus: issue.summaryStatus,
      summaryModel: issue.summaryModel,
      coverUrl: issue.coverUrl,
      fileUrl: issue.fileUrl,
      fileName: issue.fileName,
      fileSize: issue.fileSize,
      pageCount: issue.pageImages.length,
      published: issue.published,
      featured: issue.featured,
      updatedAt: issue.updatedAt.toISOString(),
    }}
  />
}
