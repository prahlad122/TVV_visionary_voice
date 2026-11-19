import Link from 'next/link'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { IssueCover, type Issue } from './issue-cover'
import type { PageCopy } from '@/lib/public-content'

const pillars = [
  { title: 'Leadership, in context.', body: 'Conversations with executives, entrepreneurs and decision-makers about their challenges, choices and ambitions.' },
  { title: 'Innovation, in practice.', body: 'A closer look at organizations finding new ways to solve problems, build capabilities and create meaningful change.' },
  { title: 'Industries, in motion.', body: 'Expert commentary and emerging trends across sectors, connecting the everyday realities of business with what comes next.' },
]
const process = [
  { title: 'Begin with a perspective.', body: 'Interviews and leadership viewpoints bring the people behind an organization into the conversation.' },
  { title: 'Look beyond the headline.', body: 'We explore the thinking, industry context and practical challenges that give a business story its meaning.' },
  { title: 'Make room for discovery.', body: 'Dedicated digital editions bring related voices together, ready to explore by industry, region or interest.' },
]
const industries = ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Sustainability', 'Manufacturing', 'Real Estate']
const regions = ['America', 'Africa', 'Europe', 'Middle East', 'Asia']

export function AboutPage({ copy, issues }: { copy: PageCopy; issues: Issue[] }) {
  return (
    <div className="site-shell">
      <SiteHeader active="about" />
      <main>
        <section className="container about-hero">
          <div className="home-hero-top"><span className="eyebrow">About The Visionary Voice</span><span className="muted" style={{ fontSize: 11, letterSpacing: 1.2 }}>A GLOBAL BUSINESS MAGAZINE</span></div>
          <div className="about-lead"><h1 className="editorial">{copy.heroTitle}</h1><div className="about-lead-copy"><h2 className="editorial">{copy.heroStatement}</h2><p>{copy.intro}</p></div></div>
        </section>

        <section className="container about-mission">
          <div><span className="eyebrow">Why we publish</span><h2 className="editorial">{copy.missionTitle}</h2><p>{copy.missionDescription}</p></div>
          <div className="about-cover-row" aria-label="Magazine cover gallery">{issues.slice(0, 3).map((issue) => <IssueCover issue={issue} key={issue.title} />)}</div>
        </section>

        <section className="container about-pillar-section">
          <div className="rule" /><span className="eyebrow" style={{ display: 'block', marginTop: 26 }}>What you’ll find in our pages</span>
          <div className="about-pillar-grid">{pillars.map((pillar) => <article className="about-pillar" key={pillar.title}><h2 className="editorial">{pillar.title}</h2><p>{pillar.body}</p></article>)}</div>
        </section>

        <section className="container story-process">
          <div><span className="eyebrow">How we tell stories</span><h2 className="editorial">More than a profile. A point of view.</h2><p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>Business is rarely one-dimensional. Our pages connect personal experience with a wider view of the organizations and industries around it.</p></div>
          <div>{process.map((step, index) => <article className="story-step" key={step.title}><span className="story-step-number">0{index + 1}</span><div><h3 className="editorial">{step.title}</h3><p>{step.body}</p></div></article>)}</div>
        </section>

        <section className="container home-section two-column-info">
          <div><span className="eyebrow">Browse by industry</span><div className="industry-list">{industries.map((name) => <Link className="taxonomy-link" href="/magazine" key={name}><span>{name}</span><span aria-hidden="true">↗</span></Link>)}</div></div>
          <div><span className="eyebrow">Five regions. Many perspectives.</span><h2 className="editorial section-title" style={{ marginTop: 14, fontSize: 36 }}>Business has no single point of view.</h2><p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Discover the leaders and organizations moving their markets forward, across our global editions.</p><div className="region-list">{regions.map((name) => <Link className="taxonomy-link" href="/magazine" key={name}><span>{name}</span><span aria-hidden="true">↗</span></Link>)}</div></div>
        </section>

        <section className="container about-collection">
          <div className="about-collection-covers">{issues.slice(0, 2).map((issue) => <IssueCover issue={issue} key={issue.title} />)}</div>
          <div><span className="eyebrow">Your next perspective is in here</span><h2 className="editorial">One collection. A world of ideas.</h2><p>Explore 650+ digital and web magazines, from leadership interviews to industry innovation. Find a familiar field, or discover something entirely new.</p><Link className="text-link" href="/magazine">Explore the magazine collection <span aria-hidden="true">↗</span></Link></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
