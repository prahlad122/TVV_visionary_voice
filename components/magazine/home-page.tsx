import Link from 'next/link'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { IssueCover, issueReaderHref, type Issue } from './issue-cover'
import type { PageCopy } from '@/lib/public-content'

const industries = ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Sustainability', 'Manufacturing', 'Real Estate']
const regions = ['America', 'Africa', 'Europe', 'Middle East', 'Asia']

export function HomePage({ copy, issues }: { copy: PageCopy; issues: Issue[] }) {
  const featuredIssue = issues.find((issue) => issue.featured) ?? issues[0]
  const editionDate = featuredIssue?.date ?? 'Latest edition'
  const leadTitle = featuredIssue?.title ?? copy.leadTitle
  const leadDescription = featuredIssue?.description || copy.leadDescription

  return (
    <div className="site-shell">
      <SiteHeader active="home" />
      <main>
        <section className="container home-hero">
          <div className="home-hero-top">
            <span className="eyebrow">Ideas. Leadership. Impact.</span>
            <span className="muted" style={{ fontSize: 11, letterSpacing: 1.2 }}>GLOBAL BUSINESS MAGAZINE / {editionDate.toUpperCase()}</span>
          </div>
          <div className="home-hero-grid">
            <div className="home-hero-copy">
              <h1 className="editorial home-hero-title">{copy.heroTitle}</h1>
              <p className="home-hero-description">{copy.heroDescription}</p>
            </div>
            <div className="hero-cover-well cover-well">
              <IssueCover issue={featuredIssue} className="hero-cover" priority />
              <div className="cover-caption"><span>THE DIGITAL EDITION</span><span>{editionDate}</span></div>
            </div>
            <div className="lead-issue">
              <span className="eyebrow">The lead edition / {editionDate}</span>
              <h2 className="editorial">{leadTitle}</h2>
              <p>{leadDescription}</p>
            </div>
            <div className="home-hero-actions">
              <Link className="primary-button" href={issueReaderHref(featuredIssue)}>Read the issue <span aria-hidden="true">↗</span></Link>
              <Link className="text-link" href="/magazine">Explore all magazines <span aria-hidden="true">↗</span></Link>
            </div>
              {/* <div className="home-hero-actions">
              <Link className="primary-button" href={issueReaderHref(featuredIssue)}>Read the Blogs<span aria-hidden="true">↗</span></Link>
              <Link className="text-link" href="/blog">Explore all Blog Posts <span aria-hidden="true">↗</span></Link>
            </div> */}
          </div>
        </section>

        <section className="container home-section">
          <div className="rule" />
          <div className="section-heading-row" style={{ marginTop: 28 }}>
            <div><span className="eyebrow">From the magazine collection</span><h2 className="editorial section-title" style={{ marginTop: 14 }}>A new edition. A new perspective.</h2></div>
            <Link className="text-link" href="/magazine">View the magazine archive <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="issue-grid">
            {issues.slice(0, 4).map((issue) => <IssueCard key={issue.id} issue={issue} />)}
          </div>
        </section>

        <section className="container home-section">
          <div className="rule" />
          <div className="section-heading-row" style={{ marginTop: 28 }}>
            <h2 className="editorial section-title">Behind the cover</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Leadership stories from our latest editions</p>
          </div>
          <div className="editorial-row">
            <EditorialTeaser issue={issues.find((issue) => issue.industry === 'Technology') ?? issues[0]} eyebrow="Technology / Leadership" body="Inside our MEA edition on leadership and the changing enterprise technology landscape." />
            <EditorialTeaser issue={issues.find((issue) => issue.industry === 'Healthcare') ?? issues[0]} eyebrow="Healthcare / America" body="Explore the expertise, decisions and ideas behind a changing healthcare sector." />
            <EditorialTeaser issue={issues.find((issue) => issue.industry === 'Leadership') ?? issues[0]} eyebrow="Leadership / Global" body="Discover The Rise List and the leaders to watch in our October collection." />
          </div>
        </section>

        <section className="container home-section two-column-info">
          <div className="rule taxonomy-rule" />
          <div>
            <span className="eyebrow">Explore the ideas shaping business</span>
            <div className="industry-list">{industries.map((item) => <TaxonomyLink key={item} label={item} href={`/magazine?industry=${encodeURIComponent(item)}`} />)}</div>
          </div>
          <div>
            <span className="eyebrow">Five regions. Many perspectives.</span>
            <h2 className="editorial section-title" style={{ marginTop: 14, fontSize: 36 }}>Business has no single point of view.</h2>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Discover the leaders and organizations moving their markets forward, across our global editions.</p>
            <div className="region-list">{regions.map((item) => <TaxonomyLink key={item} label={item} href={`/magazine?region=${encodeURIComponent(item)}`} />)}</div>
          </div>
        </section>

        <section className="about-band">
          <div className="container about-band-inner">
            <div><span className="eyebrow">This is The Visionary Voice</span><h2 className="editorial">Business stories, with people at their heart.</h2></div>
            <div><p className="muted" style={{ fontSize: 15, lineHeight: 1.75, margin: '0 0 18px' }}>We are a global business magazine publisher exploring leadership, innovation and the organizations making a difference. Through interviews, expert commentary and digital editions, we bring the human side of business into focus.</p><Link className="text-link" href="/about">More about The Visionary Voice <span aria-hidden="true">↗</span></Link></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  return <article className="issue-card"><Link href={issueReaderHref(issue)} aria-label={`Read ${issue.title}`}><IssueCover issue={issue} className="issue-card-cover" /></Link><span className="issue-card-date">{issue.date}</span><h3 className="editorial">{issue.title}</h3><p className="issue-card-meta">{issue.region} · {issue.industry} / Digital edition</p><Link className="text-link" href={issueReaderHref(issue)}>Read issue <span aria-hidden="true">↗</span></Link></article>
}

function EditorialTeaser({ issue, eyebrow, body }: { issue: Issue; eyebrow: string; body: string }) {
  return <article><span className="eyebrow" style={{ fontSize: 9 }}>{eyebrow}</span><h3 className="editorial">{issue.title}</h3><p>{issue.description || body}</p><Link className="text-link" href={issueReaderHref(issue)} style={{ marginTop: 14 }}>Explore the edition <span aria-hidden="true">↗</span></Link></article>
}

function TaxonomyLink({ label, href }: { label: string; href: string }) {
  return <Link className="taxonomy-link" href={href}><span>{label}</span><span aria-hidden="true">↗</span></Link>
}
