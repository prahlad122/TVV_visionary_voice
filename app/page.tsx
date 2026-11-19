import { HomePage } from '@/components/magazine/home-page'
import { getPublishedIssues, getPublishedPageCopy } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const [copy, issues] = await Promise.all([getPublishedPageCopy('home'), getPublishedIssues()])
  return <HomePage copy={copy} issues={issues} />
}
