'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'
import { IssueCover, issueReaderHref, type Issue } from './issue-cover'
import type { PageCopy } from '@/lib/public-content'

export function ArchivePage({ issues, copy, initialIndustry, initialRegion }: { issues: Issue[]; copy: PageCopy; initialIndustry?: string; initialRegion?: string }) {
  const industries = ['All industries', ...Array.from(new Set(issues.map((issue) => issue.industry).filter(Boolean)))]
  const regions = ['All regions', ...Array.from(new Set(issues.map((issue) => issue.region).filter(Boolean)))]
  const years = ['All years', ...Array.from(new Set(issues.map((issue) => issue.date.match(/\d{4}/)?.[0]).filter((year): year is string => Boolean(year))))]
  const featuredIssue = issues.find((issue) => issue.featured) ?? issues[0]
  const featuredTimestamp = Date.parse(featuredIssue.date)
  // "November 2026" parses as local midnight on the 1st, so read the month in local time too:
  // reading it in UTC gives October for every timezone ahead of UTC (e.g. India).
  const featuredMonth = Number.isNaN(featuredTimestamp) ? '11' : String(new Date(featuredTimestamp).getMonth() + 1).padStart(2, '0')
  const featuredYear = featuredIssue.date.match(/\d{4}/)?.[0] ?? '2026'
  const [query, setQuery] = useState('')
  const [industry, setIndustry] = useState(industries.includes(initialIndustry ?? '') ? initialIndustry! : 'All industries')
  const [region, setRegion] = useState(regions.includes(initialRegion ?? '') ? initialRegion! : 'All regions')
  const [year, setYear] = useState('All years')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const filteredIssues = useMemo(() => issues.filter((issue) => {
    const matchesQuery = `${issue.title} ${issue.industry} ${issue.region}`.toLowerCase().includes(query.trim().toLowerCase())
    return matchesQuery && (industry === 'All industries' || issue.industry === industry) && (region === 'All regions' || issue.region === region) && (year === 'All years' || issue.date.includes(year))
  }), [industry, query, region, year, issues])
  const sortedIssues = useMemo(() => [...filteredIssues].sort((left, right) => {
    const dateDelta = Date.parse(left.date) - Date.parse(right.date)
    return sort === 'newest' ? -dateDelta : dateDelta
  }), [filteredIssues, sort])
  const pageCount = Math.max(1, Math.ceil(sortedIssues.length / 8))
  const visibleIssues = sortedIssues.slice((page - 1) * 8, page * 8)

  function resetFilters() {
    setQuery('')
    setIndustry('All industries')
    setRegion('All regions')
    setYear('All years')
    setSort('newest')
    setPage(1)
  }

  return (
    <div className="site-shell">
      <SiteHeader active="magazine" />
      <main>
        <section className="container archive-intro">
          <div className="home-hero-top"><span className="eyebrow">The Visionary Voice archive</span><span className="muted" style={{ fontSize: 11, letterSpacing: 1.2 }}>DIGITAL &amp; WEB MAGAZINES</span></div>
          <div className="archive-headline"><h1 className="editorial">{copy.heroTitle}</h1><p>{copy.heroDescription}</p></div>
          <form onSubmit={(event) => { event.preventDefault(); setPage(1) }}>
            <div className="search-row">
              <label className="search-field" htmlFor="magazine-search"><Search aria-hidden="true" size={18} strokeWidth={1.5} /><input className="search-input" id="magazine-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search magazines, leaders or a topic" /></label>
              <button className="primary-button" type="submit">Find an issue <span aria-hidden="true">→</span></button>
            </div>
            <div className="archive-controls">
              <FilterSelect label="Industry" value={industry} options={industries} onChange={(value) => { setIndustry(value); setPage(1) }} />
              <FilterSelect label="Region" value={region} options={regions} onChange={(value) => { setRegion(value); setPage(1) }} />
              <FilterSelect label="Year" value={year} options={years} onChange={(value) => { setYear(value); setPage(1) }} />
            </div>
            <div className="filter-actions"><button type="button" className="reset-button" onClick={resetFilters}>Reset filters</button></div>
          </form>
          <div className="rule" style={{ marginTop: 16 }} />
          <section className="featured-issue" aria-labelledby="featured-title">
            <div className="featured-topline"><span className="eyebrow">In focus / The current issue</span><span className="issue-number mobile-issue-number"><strong className="editorial">{featuredMonth}</strong><span>{featuredYear}</span></span></div>
            <div className="featured-cover-well cover-well"><IssueCover issue={featuredIssue} className="featured-cover" /></div>
            <div className="featured-copy"><h2 className="editorial" id="featured-title">{featuredIssue.title}</h2><p>{featuredIssue.description || copy.featuredDescription}</p><p className="muted" style={{ fontSize: 12 }}>{featuredIssue.date}&nbsp;&nbsp; / &nbsp;&nbsp;Digital edition</p><Link className="text-link" href={issueReaderHref(featuredIssue)}>Read the issue <span aria-hidden="true">↗</span></Link></div>
            <div className="issue-number desktop-issue-number"><strong className="editorial">{featuredMonth}</strong><span>{featuredYear}</span></div>
          </section>
        </section>
        <section className="container archive-results" id="latest">
          <div className="rule" />
          <div className="section-heading-row archive-results-heading" style={{ marginTop: 28 }}><div><h2 className="editorial section-title">Latest issues</h2><p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>{sortedIssues.length} issues in this view</p></div><label className="archive-sort">Sort by <select aria-label="Sort issues" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
          <div className="archive-grid">
            {sortedIssues.length ? visibleIssues.map((issue) => <IssueCard key={issue.id ?? issue.title} issue={issue} />) : <div className="empty-state"><span className="eyebrow">Search results / 0 issues</span><h3 className="editorial">No issues found{query ? ` for “${query}”` : ''}.</h3><p>Try a broader topic or clear your industry, region and year filters to explore the full collection.</p><button className="secondary-button" onClick={resetFilters}>Clear search &amp; filters <span aria-hidden="true">↗</span></button></div>}
          </div>
          {sortedIssues.length > 0 && <div className="archive-pagination"><p className="muted">Showing {(page - 1) * 8 + 1}–{Math.min(page * 8, sortedIssues.length)} of {sortedIssues.length} published issues</p><nav className="pagination-items" aria-label="Magazine pages">{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button className="page-button" key={pageNumber} aria-current={page === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}{page < pageCount && <button className="page-button" onClick={() => setPage((current) => Math.min(current + 1, pageCount))} aria-label="Next page">Next →</button>}</nav></div>}
        </section>
        <section className="container home-section two-column-info">
          <div><span className="eyebrow">Browse by industry</span><div className="industry-list">{industries.slice(1).map((name) => <Link className="taxonomy-link" href="#latest" key={name} onClick={() => { setIndustry(name); setPage(1) }}><span>{name}</span><span aria-hidden="true">↗</span></Link>)}</div></div>
          <div><span className="eyebrow">Five regions. Many perspectives.</span><h2 className="editorial section-title" style={{ marginTop: 14, fontSize: 36 }}>Business has no single point of view.</h2><p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>Discover the leaders and organizations moving their markets forward, across our global editions.</p><div className="region-list">{regions.slice(1).map((name) => <Link className="taxonomy-link" href="#latest" key={name} onClick={() => { setRegion(name); setPage(1) }}><span>{name}</span><span aria-hidden="true">↗</span></Link>)}</div></div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  const id = `filter-${label.toLowerCase()}`
  return <div className="filter-field"><label htmlFor={id}>{label}</label><select className="filter-control" id={id} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></div>
}

function IssueCard({ issue }: { issue: Issue }) {
  return <article className="issue-card"><Link href={issueReaderHref(issue)} aria-label={`Read ${issue.title}`}><IssueCover issue={issue} className="issue-card-cover" /></Link><span className="issue-card-date">{issue.date}</span><h3 className="editorial">{issue.title}</h3><p className="issue-card-meta">{issue.region} · {issue.industry} / Digital edition</p><Link className="text-link" href={issueReaderHref(issue)}>Read issue <span aria-hidden="true">↗</span></Link></article>
}
