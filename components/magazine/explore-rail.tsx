import Link from 'next/link'
import Image from 'next/image'
import { ExternalLink } from 'lucide-react'

/** One card in a reader page's right-hand panel: a magazine issue or a blog post. */
export type RailItem = {
  href: string
  /** Small red label, e.g. the issue's industry or the post's category. */
  label: string
  title: string
  detail: string
  /** null shows a lettered placeholder (blog posts without a cover). */
  image: string | null
  action: string
}

export function RailCard({ item }: { item: RailItem }) {
  return <Link className="article-ad-card" href={item.href}>
    <div className="article-ad-image">
      {item.image
        ? <Image src={item.image} alt="" fill sizes="(max-width: 720px) 40vw, 300px" />
        : <span className="blog-image-placeholder" aria-hidden="true"><span className="editorial">{item.title.charAt(0)}</span></span>}
    </div>
    <div className="article-ad-copy"><span>{item.label}</span><h3 className="editorial">{item.title}</h3>{item.detail && <p>{item.detail}</p>}<b>{item.action} <ExternalLink aria-hidden="true" /></b></div>
  </Link>
}

/** A titled group of cards with a "see all" link, used to cross-link the magazine and the blog. */
export function RailSection({ eyebrow, title, items, moreHref, moreLabel }: { eyebrow: string; title: string; items: RailItem[]; moreHref: string; moreLabel: string }) {
  if (!items.length) return null
  return <section className="rail-section" aria-label={title}>
    <div className="article-ad-heading"><span>{eyebrow}</span><h2 className="editorial">{title}</h2></div>
    {items.map((item) => <RailCard item={item} key={item.href} />)}
    <Link className="article-archive-link" href={moreHref}>{moreLabel} <span>→</span></Link>
  </section>
}

/** Shortens a description for a side-panel card. */
export function railDetail(text: string | undefined, max = 130) {
  const value = (text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max).replace(/\s+\S*$/, '')}…` : value
}
