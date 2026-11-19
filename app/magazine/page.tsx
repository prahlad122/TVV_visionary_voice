import type { Metadata } from 'next'
import { ArchivePage } from '@/components/magazine/archive-page'
import { getPublishedIssues, getPublishedPageCopy } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Magazine Archive | The Visionary Voice',
  description: 'Explore leadership viewpoints, expert commentary and digital business magazines from The Visionary Voice.',
}

export default async function Page({ searchParams }: { searchParams: Promise<{ industry?: string; region?: string }> }) {
  const params = await searchParams
  const [copy, issues] = await Promise.all([getPublishedPageCopy('magazine'), getPublishedIssues()])
  return <ArchivePage copy={copy} issues={issues} initialIndustry={params.industry} initialRegion={params.region} />
}
