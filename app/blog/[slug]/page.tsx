import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { BlogContent } from '@/components/blog/blog-content'
import { SubscribeButton } from '@/components/subscribe-button'
import { RailSection, railDetail } from '@/components/magazine/explore-rail'
import { issueReaderHref } from '@/components/magazine/issue-cover'
import { getPublishedPostBySlug, getPublishedPosts } from '@/lib/blog'
import { getPublishedIssues } from '@/lib/public-content'

export const dynamic = 'force-dynamic'

export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const post = await getPublishedPostBySlug(slug)
  if (!post) return { title: 'Post not found | The Visionary Voice' }
  return {
    title: `${post.title} | The Visionary Voice`,
    description: post.excerpt,
    openGraph: { type: 'article', title: post.title, description: post.excerpt, publishedTime: post.isoDate, ...(post.image ? { images: [post.image] } : {}) },
  }
}

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = await getPublishedPostBySlug(slug)
  if (!post) notFound()
  const [allPosts, issues] = await Promise.all([getPublishedPosts(), getPublishedIssues()])
  const more = allPosts.filter((other) => other.id !== post.id).slice(0, 3)
  // The right-hand panel points blog readers to the magazine: the featured issue first, then the latest.
  const magazines = issues.slice(0, 3).map((issue) => ({
    href: issueReaderHref(issue),
    label: [issue.industry, issue.date].filter(Boolean).join(' · ') || 'The magazine',
    title: issue.title,
    detail: railDetail(issue.description),
    image: issue.image,
    action: 'Read the issue',
  }))

  return <div className="article-shell">
    <header className="article-header"><Link className="article-back" href="/blog"><ArrowLeft aria-hidden="true" /> <span>All posts</span></Link><Link className="article-wordmark" href="/">The Visionary Voice</Link><div className="header-actions"><SubscribeButton className="article-subscribe" /></div></header>
    <main className="article-layout blog-post-layout">
      <div className="blog-post-column">
      <article className="blog-post">
        <div className="article-kicker">{post.category || 'The blog'} <span>·</span> {post.date} <span>·</span> {post.minutes} min read</div>
        <h1 className="editorial">{post.title}</h1>
        {post.excerpt && <p className="article-deck">{post.excerpt}</p>}
        {post.author && <p className="blog-author">By {post.author}</p>}
        {post.image && <figure className="blog-post-image"><Image src={post.image} alt="" fill priority sizes="(max-width: 760px) 100vw, 760px" /></figure>}
        <div className="article-body blog-body"><BlogContent content={post.content} /></div>
        <p className="blog-post-end"><Link className="text-link" href="/blog"><ArrowLeft aria-hidden="true" /> Back to all posts</Link></p>
      </article>
      {more.length > 0 && <aside className="blog-more" aria-labelledby="blog-more-title">
        <div className="rule" />
        <h2 className="editorial section-title" id="blog-more-title">Keep reading</h2>
        <div className="blog-more-list">{more.map((other) => <Link className="blog-more-item" href={`/blog/${other.slug}`} key={other.id}>
          <span className="blog-meta">{other.category ? `${other.category} · ` : ''}{other.date}</span>
          <strong className="editorial">{other.title}</strong>
          <span className="text-link">Read <span aria-hidden="true">↗</span></span>
        </Link>)}</div>
      </aside>}
      </div>
      <aside className="article-ad-rail has-sections" aria-label="From the magazine">
        <RailSection eyebrow="The magazine" title="From the magazine" items={magazines} moreHref="/magazine" moreLabel="Browse all magazine editions" />
      </aside>
    </main>
  </div>
}
