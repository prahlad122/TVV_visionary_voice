import type { Metadata } from 'next'
import { AboutPage } from '@/components/magazine/about-page'
import { getPublishedIssues, getPublishedPageCopy } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'About Us | The Visionary Voice',
  description: 'Learn how The Visionary Voice brings leadership, innovation and the people shaping business into focus.',
}

export default async function Page() {
  const [copy, issues] = await Promise.all([getPublishedPageCopy('about'), getPublishedIssues()])
  return <AboutPage copy={copy} issues={issues} />
}
