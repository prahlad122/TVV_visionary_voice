import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MagazineReader } from '@/components/magazine/reader-viewer'
import { getPublishedIssueById } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Read the magazine | The Visionary Voice',
  description: 'Turn the pages of The Visionary Voice e-copy like a printed magazine.',
}

export default async function BookReaderPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  const issue = await getPublishedIssueById(issueId)
  if (!issue) notFound()
  return <MagazineReader issue={issue} />
}
