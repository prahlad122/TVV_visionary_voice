'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, BookOpen, Download, ExternalLink } from 'lucide-react'
import { tidyExtractedText } from '@/lib/text-tidy'
import { SummaryPreview } from './summary-preview'
import type { Issue } from './issue-cover'

function paragraphs(text: string) {
  const parts = text.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
  // PDF text boxes can split one sentence across two blocks ("…expects evidence of" /
  // "practical engineering capability."). Rejoin a block that stops mid-sentence with the
  // next block when that one continues in lowercase.
  const merged: string[] = []
  for (const part of parts) {
    const previous = merged[merged.length - 1]
    const continues = previous && !previous.startsWith('# ') && !part.startsWith('# ')
      && (/[,–—-]$/.test(previous) || (!/[.!?:;"”’)]$/.test(previous) && /^[\p{Ll}]/u.test(part)))
    if (continues) merged[merged.length - 1] = `${previous} ${part}`
    else merged.push(part)
  }
  return merged
}

function EditorialCopy({ text }: { text: string }) {
  return <>{paragraphs(text).map((block, index) => block.startsWith('# ')
    ? <h2 key={index}>{block.slice(2)}</h2>
    : <p key={index}>{block.replace(/\n+/g, ' ')}</p>)}</>
}

/**
 * Shows the article text stored when the issue was uploaded, so the page opens
 * instantly. It never downloads the PDF: issues without stored text point
 * readers to the magazine view instead.
 */
export function ArticleReader({ issue }: { issue: Issue }) {
  const bookHref = `/read/${encodeURIComponent(issue.id)}/book`
  const ads = [
    { label: 'Explore the edition', title: issue.coverName, detail: issue.description || `Discover more perspectives in ${issue.industry}.`, image: issue.image, href: '/magazine' },
    { label: 'Stay in perspective', title: 'Ideas worth turning to.', detail: 'Meet the people and organizations shaping business.', image: '/cover-man-suit.png', href: '/about' },
  ]

  return <div className="article-shell">
    <header className="article-header"><Link className="article-back" href="/magazine"><ArrowLeft aria-hidden="true" /> <span>All editions</span></Link><Link className="article-wordmark" href="/">The Visionary Voice</Link><Link className="article-subscribe" href="/#newsletter">Subscribe</Link></header>
    <main className="article-layout">
      <article className="issue-article">
        <div className="article-kicker">{issue.industry} <span>·</span> {issue.region} <span>·</span> {issue.date}</div>
        <h1 className="editorial">{issue.title}</h1>
        <p className="article-deck">{issue.description || `A ${issue.industry.toLowerCase()} perspective from ${issue.region}.`}</p>
        <figure className="article-lead-image"><Image src={issue.image} alt={`Cover image for ${issue.title}`} fill priority sizes="(max-width: 720px) 100vw, 760px" /><figcaption>From the {issue.date} {issue.industry} edition</figcaption></figure>
        <div className="article-byline"><span>THE VISIONARY VOICE</span><span>{issue.date}</span>{issue.fileUrl && <Link href={bookHref}><BookOpen aria-hidden="true" /> Read as a magazine</Link>}{issue.fileUrl && <a href={`${issue.fileUrl}&download=1`}><Download aria-hidden="true" /> Download original PDF</a>}</div>
        {/* The description is already the deck under the title, so it is not repeated here. */}
        {issue.summary
          ? <>
            <section className="article-body summary-article" aria-label="The issue in brief">
              <span className="eyebrow">The issue in brief</span>
              <SummaryPreview summary={issue.summary} lines={7} />
              {issue.fileUrl && <p className="summary-cta"><Link className="text-link" href={bookHref}><BookOpen aria-hidden="true" /> Read the full issue as a magazine</Link></p>}
            </section>
            {/* Text extracted from a designed PDF is rough, so it sits behind the edited summary. */}
            {issue.articleText?.trim() && <details className="article-fulltext">
              <summary>Read the full text from the issue</summary>
              <div className="article-body"><EditorialCopy text={tidyExtractedText(issue.articleText)} /></div>
            </details>}
          </>
          : <section className="article-body" aria-label="Issue article content">
            {issue.articleText?.trim()
              ? <EditorialCopy text={tidyExtractedText(issue.articleText)} />
              : <p className="article-message">
                The article text for this issue is not available yet.
                {issue.fileUrl && <> <Link className="text-link" href={bookHref}>Read the full issue as a magazine</Link>.</>}
              </p>}
          </section>}
        {issue.fileUrl && <a className="article-pdf-link" href={`${issue.fileUrl}&download=1`}><Download aria-hidden="true" /> Download the original issue PDF</a>}
      </article>
      <aside className="article-ad-rail" aria-label="Sponsored stories and recommendations">
        <div className="article-ad-heading"><span>Discover</span><h2 className="editorial">More to explore</h2></div>
        {ads.map((ad) => <Link className="article-ad-card" href={ad.href} key={ad.title}><div className="article-ad-image"><Image src={ad.image} alt="" fill sizes="(max-width: 720px) 50vw, 300px" /></div><div className="article-ad-copy"><span>{ad.label}</span><h3 className="editorial">{ad.title}</h3><p>{ad.detail}</p><b>Explore <ExternalLink aria-hidden="true" /></b></div></Link>)}
        <Link className="article-archive-link" href="/magazine">Browse all magazine editions <span>→</span></Link>
      </aside>
    </main>
  </div>
}
