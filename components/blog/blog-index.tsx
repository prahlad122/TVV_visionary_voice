import Link from 'next/link'
import Image from 'next/image'
import { SiteHeader } from '@/components/magazine/site-header'
import { SiteFooter } from '@/components/magazine/site-footer'
import type { PublicBlogPost } from '@/lib/blog'

const postHref = (post: PublicBlogPost) => `/blog/${post.slug}`

function PostMeta({ post }: { post: PublicBlogPost }) {
  return <p className="blog-meta">
    {post.category && <><span className="blog-meta-category">{post.category}</span><span aria-hidden="true">·</span></>}
    <time dateTime={post.isoDate}>{post.date}</time><span aria-hidden="true">·</span><span>{post.minutes} min read</span>
  </p>
}

function PostImage({ post, sizes, priority = false }: { post: PublicBlogPost; sizes: string; priority?: boolean }) {
  return post.image
    ? <Image src={post.image} alt="" fill sizes={sizes} priority={priority} />
    : <span className="blog-image-placeholder" aria-hidden="true"><span className="editorial">{post.title.charAt(0)}</span></span>
}

/** The public /blog page: the newest post up top, then the rest as a grid. */
export function BlogIndex({ posts, categories, activeCategory }: { posts: PublicBlogPost[]; categories: string[]; activeCategory?: string }) {
  const [lead, ...rest] = posts
  return <div className="site-shell">
    <SiteHeader active="blog" />
    <main>
      <section className="container blog-intro">
        <div className="home-hero-top"><span className="eyebrow">The Visionary Voice blog</span><span className="muted" style={{ fontSize: 11, letterSpacing: 1.2 }}>IDEAS, NOTES &amp; INTERVIEWS</span></div>
        <div className="archive-headline"><h1 className="editorial">Between the editions.</h1><p>Shorter reads from our editors: the ideas, people and conversations behind the magazine.</p></div>
        {categories.length > 1 && <nav className="blog-categories" aria-label="Blog categories">
          <Link className={!activeCategory ? 'blog-chip is-active' : 'blog-chip'} href="/blog" aria-current={!activeCategory ? 'page' : undefined}>All posts</Link>
          {categories.map((category) => <Link key={category} className={activeCategory === category ? 'blog-chip is-active' : 'blog-chip'} href={`/blog?category=${encodeURIComponent(category)}`} aria-current={activeCategory === category ? 'page' : undefined}>{category}</Link>)}
        </nav>}
      </section>

      {lead
        ? <>
          <section className="container blog-lead" aria-labelledby="blog-lead-title">
            <Link className="blog-lead-image" href={postHref(lead)} tabIndex={-1} aria-hidden="true"><PostImage post={lead} sizes="(max-width: 860px) 100vw, 60vw" priority /></Link>
            <div className="blog-lead-copy">
              <span className="eyebrow">Latest post</span>
              <h2 className="editorial" id="blog-lead-title"><Link href={postHref(lead)}>{lead.title}</Link></h2>
              <p>{lead.excerpt}</p>
              <PostMeta post={lead} />
              {lead.author && <p className="blog-author">By {lead.author}</p>}
              <Link className="text-link" href={postHref(lead)}>Read the post <span aria-hidden="true">↗</span></Link>
            </div>
          </section>
          {rest.length > 0 && <section className="container blog-list">
            <div className="rule" />
            <h2 className="editorial section-title" style={{ marginTop: 28 }}>More from the blog</h2>
            <div className="blog-grid">
              {rest.map((post) => <article className="blog-card" key={post.id}>
                <Link className="blog-card-image" href={postHref(post)} tabIndex={-1} aria-hidden="true"><PostImage post={post} sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw" /></Link>
                <PostMeta post={post} />
                <h3 className="editorial"><Link href={postHref(post)}>{post.title}</Link></h3>
                <p>{post.excerpt}</p>
                <Link className="text-link" href={postHref(post)}>Read the post <span aria-hidden="true">↗</span></Link>
              </article>)}
            </div>
          </section>}
        </>
        : <section className="container blog-list"><div className="empty-state">
          <span className="eyebrow">{activeCategory ? `${activeCategory} / 0 posts` : 'Coming soon'}</span>
          <h3 className="editorial">{activeCategory ? `No posts in “${activeCategory}” yet.` : 'The first posts are on their way.'}</h3>
          <p>{activeCategory ? 'Try another category, or browse every post.' : 'In the meantime, explore the latest editions of the magazine.'}</p>
          <Link className="secondary-button" href={activeCategory ? '/blog' : '/magazine'}>{activeCategory ? 'See all posts' : 'Browse the magazine'} <span aria-hidden="true">↗</span></Link>
        </div></section>}
    </main>
    <SiteFooter />
  </div>
}
