import type { Metadata } from 'next'
import { BlogIndex } from '@/components/blog/blog-index'
import { getPublishedPosts } from '@/lib/blog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Blog | The Visionary Voice',
  description: 'Ideas, notes and interviews from the editors of The Visionary Voice.',
}

export default async function BlogPage(props: PageProps<'/blog'>) {
  const { category } = await props.searchParams
  const posts = await getPublishedPosts()
  const categories = Array.from(new Set(posts.map((post) => post.category).filter(Boolean))).sort()
  const active = typeof category === 'string' && categories.includes(category) ? category : undefined
  return <BlogIndex posts={active ? posts.filter((post) => post.category === active) : posts} categories={categories} activeCategory={active} />
}
