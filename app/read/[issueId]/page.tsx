import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleReader } from '@/components/magazine/article-reader'
import { railDetail } from '@/components/magazine/explore-rail'
import { getPublishedPosts } from '@/lib/blog'
import { getPublishedIssueById } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Read an issue | The Visionary Voice',
  description: 'Read business perspectives from The Visionary Voice as an accessible article.',
}

export default async function ReaderPage({ params }: { params: Promise<{ issueId: string }> }) {
  const { issueId } = await params
  const [issue, posts] = await Promise.all([getPublishedIssueById(issueId), getPublishedPosts()])
  if (!issue) notFound()
  // The right-hand panel points magazine readers to the latest blog posts.
  const blogPosts = posts.slice(0, 2).map((post) => ({
    href: `/blog/${post.slug}`,
    label: post.category || 'The blog',
    title: post.title,
    detail: railDetail(post.excerpt),
    image: post.image,
    action: 'Read the post',
  }))
  return <ArticleReader issue={issue} blogPosts={blogPosts} />
}
