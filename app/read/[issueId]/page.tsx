import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleReader } from '@/components/magazine/article-reader'
import { getPublishedIssueById } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Read an issue | The Visionary Voice',
  description: 'Read business perspectives from The Visionary Voice as an accessible article.',
}

export default async function ReaderPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  const issue = await getPublishedIssueById(issueId)
  if (!issue) notFound()
  return <ArticleReader issue={issue} />
}
