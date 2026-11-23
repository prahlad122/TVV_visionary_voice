'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Download, ExternalLink } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { Issue } from './issue-cover'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type ExtractedPage = { number: number; text: string }
type ExtractionStatus = 'loading' | 'ready' | 'empty' | 'error' | 'unreadable'

function paragraphs(text: string) {
  return text.split(/\n\s*\n/).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

function EditorialCopy({ text }: { text: string }) {
  return <>{paragraphs(text).map((block, index) => block.startsWith('# ')
    ? <h2 key={index}>{block.slice(2)}</h2>
    : <p key={index}>{block.replace(/\n+/g, ' ')}</p>)}</>
}

export function ArticleReader({ issue }: { issue: Issue }) {
  const [pages, setPages] = useState<ExtractedPage[]>([])
  const [status, setStatus] = useState<ExtractionStatus>(issue.articleText?.trim() ? 'ready' : issue.fileUrl ? 'loading' : 'empty')

  useEffect(() => {
    if (issue.articleText?.trim() || !issue.fileUrl) return
    let cancelled = false
    const task = pdfjs.getDocument({ url: issue.fileUrl, withCredentials: true })
    task.promise.then(async (pdf) => {
      const rawPages: ExtractedPage[] = []
      for (let number = 1; number <= pdf.numPages; number += 1) {
        if (cancelled) return
        try {
          const page = await pdf.getPage(number)
          const content = await page.getTextContent()
          let previousY: number | null = null
          const text = content.items.map((item) => {
            if (!('str' in item)) return ''
            const y = item.transform[5]
            const gap = previousY === null ? 0 : Math.abs(y - previousY)
            const separator = gap > Math.max(12, (item.height ?? 10) * 1.45) ? '\n\n' : gap > 2 ? '\n' : ' '
            previousY = y
            return `${separator}${item.str}`
          }).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
          if (text) rawPages.push({ number, text })
        } catch { /* Continue extracting other pages if one page is damaged. */ }
      }
      if (cancelled) return
      const rawText = rawPages.map((page) => page.text).join(' ')
      const flagshipPdf = /ai\s*native\s*flagship\s*program/i.test(issue.title)
        || (/AI[\s\u001D-]+NATIVE/i.test(rawText) && /FLAGSHIP\s+PROGRAM/i.test(rawText) && /FELLOWSHIP/i.test(rawText))
      const glyphMap: Record<string, string> = {
        '\u0002': 'r', '\u000E': 'r', '\u0010': 'r', '\u001D': '-',
        '\u0084': '(', '\u0085': ')', '\u0093': '-', '\u009E': '-',
      }
      const extracted = rawPages.map((page) => ({
        ...page,
        text: flagshipPdf ? page.text.replace(/[\u0002\u000E\u0010\u001D\u0084\u0085\u0093\u009E]/g, (glyph) => glyphMap[glyph] ?? glyph) : page.text,
      }))
      const joined = extracted.map((page) => page.text).join(' ')
      const hasUnmappedGlyph = /[\p{C}\u25A0-\u25FF]/u.test(joined)
      setPages(hasUnmappedGlyph ? [] : extracted)
      setStatus(hasUnmappedGlyph ? 'unreadable' : extracted.length ? 'ready' : 'empty')
    }).catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true; void task.destroy() }
  }, [issue.articleText, issue.fileUrl, issue.title])

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
        <div className="article-byline"><span>THE VISIONARY VOICE</span><span>{issue.date}</span>{issue.fileUrl && <a href={`${issue.fileUrl}&download=1`}><Download aria-hidden="true" /> Download original PDF</a>}</div>
        <section className="article-body" aria-label="Issue article content">
          {issue.articleText?.trim()
            ? <><p className="article-intro">{issue.description}</p><EditorialCopy text={issue.articleText} /></>
            : <>
              {status === 'loading' && <p className="article-message" role="status">Preparing article text from this PDF...</p>}
              {status === 'error' && <p className="article-message">The PDF could not be opened. {issue.description}</p>}
              {status === 'unreadable' && <p className="article-message">This PDF’s text encoding cannot be read reliably. Add a .txt article or paste the article copy in Admin for accessible reading.</p>}
              {status === 'empty' && <p className="article-message">The accessible article text has not been added for this issue yet.</p>}
              {status === 'ready' && <><p className="article-intro">{issue.description}</p>{pages.map((page) => <section className="extracted-page" key={page.number} aria-label={`Extracted page ${page.number}`}><EditorialCopy text={page.text} /></section>)}</>}
              {!issue.fileUrl && issue.description && <p>{issue.description}</p>}
            </>}
        </section>
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
