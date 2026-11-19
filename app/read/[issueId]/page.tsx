import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MagazineReader } from '@/components/magazine/reader-viewer'
import { getPublishedIssueById } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Digital magazine reader | The Visionary Voice',
  description: 'Read the latest digital magazine edition from The Visionary Voice.',
}

export default async function ReaderPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  const issue = await getPublishedIssueById(issueId)
  if (!issue) notFound()
  return <MagazineReader issue={issue} />
}
