'use client'

import { type FormEvent, type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { ArrowLeft, Bookmark, Download, List, Maximize, Minus, Plus, Search, Share2, X } from 'lucide-react'
import * as pdfjs from 'pdfjs-dist'
import type { Issue } from './issue-cover'
import { BookViewer } from './book-viewer'
import { SubscribeButton } from '@/components/subscribe-button'
import { LARGE_PDF_OPTIONS, type ReaderPdf } from './page-image-cache'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type Panel = 'contents' | 'bookmarks' | 'search' | null
type OutlineNode = { title: string; dest?: string | unknown[]; items?: OutlineNode[] }
type OutlineRow = { title: string; dest?: string | unknown[]; depth: number }

function flattenOutline(items: OutlineNode[], depth = 0): OutlineRow[] {
  return items.flatMap((item) => [
    { title: item.title, dest: item.dest, depth },
    ...flattenOutline(item.items ?? [], depth + 1),
  ])
}

export function MagazineReader({ issue }: { issue: Issue }) {
  const images = issue.pages?.length ? issue.pages : undefined
  // With pre-rendered page images the reader never needs the PDF to show pages.
  // It is opened only for the table of contents or search, and only when asked.
  const [pdfWanted, setPdfWanted] = useState(!images)
  const { data: pdf, isLoading, error: pdfError } = useSWR<ReaderPdf, Error>(
    pdfWanted ? issue.fileUrl ?? null : null,
    (url: string) => pdfjs.getDocument({ url, withCredentials: true, ...LARGE_PDF_OPTIONS }).promise,
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false },
  )
  const [pdfPageCount, setPdfPageCount] = useState(1)
  const pageCount = images ? images.length : pdfPageCount
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [isMobile, setIsMobile] = useState(false)
  const [outline, setOutline] = useState<OutlineRow[]>([])
  const [panel, setPanel] = useState<Panel>(null)
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [searchStatus, setSearchStatus] = useState('')
  const [shareStatus, setShareStatus] = useState('')
  const loading = !images && Boolean(issue.fileUrl) && isLoading
  const loadError = pdfError ? 'This e-copy could not be opened. Please try again or return to the magazine archive.' : ''

  // Contents and search read the PDF; open it the first time either panel is used.
  useEffect(() => {
    if (panel === 'contents' || panel === 'search') setPdfWanted(true)
  }, [panel])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!pdf) return
    setPdfPageCount(pdf.numPages)
    // In image mode the reader may already be mid-issue when the PDF opens for search.
    if (!images) setCurrentPage(1)
    pdf.getOutline().then((items) => {
      if (items) setOutline(flattenOutline(items as OutlineNode[]))
    }).catch(() => setOutline([]))
  }, [pdf, images])

  // Keep the page within the issue once the real page count is known.
  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(Math.max(1, pageCount))
  }, [currentPage, pageCount])

  const progress = useMemo(() => pageCount ? Math.round((currentPage / pageCount) * 100) : 0, [currentPage, pageCount])
  function goToPage(pageNumber: number) {
    setCurrentPage(Math.max(1, Math.min(pageCount, Math.floor(pageNumber || 1))))
    setPanel(null)
  }

  // Page turns come from the book (page clicks, edge buttons, arrow keys, swipes).
  function turnTo(pageNumber: number) {
    setCurrentPage(pageNumber)
    setPanel(null)
  }

  function toggleBookmark() {
    setBookmarks((saved) => saved.includes(currentPage) ? saved.filter((page) => page !== currentPage) : [...saved, currentPage].sort((a, b) => a - b))
  }

  async function searchPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pdf || !searchTerm.trim()) return
    setSearchStatus('Searching this issue…')
    const needle = searchTerm.trim().toLocaleLowerCase()
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      try {
        const page = await pdf.getPage(pageNumber)
        const textContent = await page.getTextContent()
        const text = textContent.items.map((item) => 'str' in item ? item.str : '').join(' ').toLocaleLowerCase()
        if (text.includes(needle)) {
          setSearchStatus(`Found on page ${pageNumber}.`)
          goToPage(pageNumber)
          setPanel('search')
          return
        }
      } catch {
        continue
      }
    }
    setSearchStatus('No matching text was found in this issue.')
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
  }

  async function shareIssue() {
    const shareData = { title: issue.title, url: window.location.href }
    try {
      if (navigator.share) await navigator.share(shareData)
      else {
        await navigator.clipboard.writeText(window.location.href)
        setShareStatus('Reader link copied.')
      }
    } catch {
      setShareStatus('')
    }
  }

  function toggleFullscreen() {
    const reader = document.getElementById('magazine-reader')
    if (document.fullscreenElement) void document.exitFullscreen()
    else void reader?.requestFullscreen()
  }

  return (
    <div className="reader-shell" id="magazine-reader">
      <ReaderHeader onSearch={() => setPanel(panel === 'search' ? null : 'search')} downloadHref={issue.fileUrl ? `${issue.fileUrl}&download=1` : undefined} />
      <main className={`reader-main${pdf ? ' has-book' : ''}`}>
        {images || pdf ? (
          <BookViewer images={images} pdf={pdf} page={currentPage} zoom={zoom} singlePage={isMobile} onPageChange={turnTo} />
        ) : (
          <ReaderPreview issue={issue} loading={loading} error={loadError} />
        )}
        {panel && <ReaderPanel panel={panel} issue={issue} outline={outline} bookmarks={bookmarks} currentPage={currentPage} isBookmarked={bookmarks.includes(currentPage)} pdf={pdf ?? null} searchTerm={searchTerm} searchStatus={searchStatus} onClose={() => setPanel(null)} onJump={goToPage} onBookmark={toggleBookmark} onSearchChange={setSearchTerm} onSearchSubmit={searchPdf} onSearchKeyDown={handleSearchKeyDown} />}
      </main>
      <DesktopToolbar issue={issue} currentPage={currentPage} pageCount={pageCount} zoom={zoom} isBookmarked={bookmarks.includes(currentPage)} shareStatus={shareStatus} onPageChange={goToPage} onZoomChange={setZoom} onTogglePanel={setPanel} onBookmark={toggleBookmark} onFullscreen={toggleFullscreen} onShare={shareIssue} />
      <MobileToolbar currentPage={currentPage} pageCount={pageCount} progress={progress} isBookmarked={bookmarks.includes(currentPage)} onTogglePanel={setPanel} onBookmark={toggleBookmark} />
    </div>
  )
}

function ReaderHeader({ onSearch, downloadHref }: { onSearch: () => void; downloadHref?: string }) {
  return <header className="reader-header">
    <div className="reader-desktop-header">
      <Link className="wordmark" href="/" aria-label="The Visionary Voice home"><span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><span className="wordmark-tagline">THE WORLD OF BUSINESS, IN PERSPECTIVE</span></Link>
      <nav className="reader-nav" aria-label="Main navigation"><Link href="/">Home</Link><Link className="active" href="/magazine">Magazine</Link><Link href="/blog">Blog</Link><Link href="/about">About Us</Link></nav>
      <div className="header-actions">
        {downloadHref && <a className="header-download" href={downloadHref} aria-label="Download the issue PDF"><Download aria-hidden="true" /><span>Download</span></a>}
        <SubscribeButton className="reader-subscribe" />
      </div>
    </div>
    <div className="reader-mobile-header">
      <Link href="/magazine" aria-label="Back to magazines"><ArrowLeft aria-hidden="true" /></Link>
      <Link className="reader-mobile-wordmark" href="/"><span className="reader-mobile-wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><small>BUSINESS IN PERSPECTIVE</small></Link>
      <button type="button" onClick={onSearch} aria-label="Search this issue"><Search aria-hidden="true" /></button>
    </div>
  </header>
}

function DesktopToolbar({ issue, currentPage, pageCount, zoom, isBookmarked, shareStatus, onPageChange, onZoomChange, onTogglePanel, onBookmark, onFullscreen, onShare }: {
  issue: Issue
  currentPage: number
  pageCount: number
  zoom: number
  isBookmarked: boolean
  shareStatus: string
  onPageChange: (page: number) => void
  onZoomChange: (zoom: number) => void
  onTogglePanel: (panel: Panel) => void
  onBookmark: () => void
  onFullscreen: () => void
  onShare: () => void
}) {
  return <footer className="reader-desktop-toolbar">
    <div className="reader-toolbar-group reader-toolbar-left"><button type="button" onClick={() => onTogglePanel('contents')}><List aria-hidden="true" />Table of Contents</button><button type="button" onClick={() => onTogglePanel('bookmarks')}><Bookmark aria-hidden="true" />Bookmarks</button></div>
    <div className="reader-toolbar-center"><div className="reader-zoom-control"><button type="button" aria-label="Zoom out" onClick={() => onZoomChange(Math.max(75, zoom - 25))}><Minus aria-hidden="true" /></button><span>{zoom}%</span><button type="button" aria-label="Zoom in" onClick={() => onZoomChange(Math.min(200, zoom + 25))}><Plus aria-hidden="true" /></button></div><label className="reader-page-input"><span className="sr-only">Current page</span><input type="number" min={1} max={pageCount} value={currentPage} onChange={(event) => onPageChange(Number(event.target.value))} /><span>of {pageCount}</span></label></div>
    <div className="reader-toolbar-group reader-toolbar-right"><button type="button" onClick={() => onTogglePanel('search')} aria-label="Search issue"><Search aria-hidden="true" /></button><button type="button" onClick={onFullscreen} aria-label="Toggle fullscreen"><Maximize aria-hidden="true" /></button><button type="button" onClick={onShare} aria-label="Share issue"><Share2 aria-hidden="true" /></button>{shareStatus && <span className="reader-share-status" role="status">{shareStatus}</span>}</div>
  </footer>
}

function MobileToolbar({ currentPage, pageCount, progress, isBookmarked, onTogglePanel, onBookmark }: {
  currentPage: number
  pageCount: number
  progress: number
  isBookmarked: boolean
  onTogglePanel: (panel: Panel) => void
  onBookmark: () => void
}) {
  return <footer className="reader-mobile-toolbar">
    <button type="button" onClick={() => onTogglePanel('contents')} aria-label="Open table of contents"><List aria-hidden="true" /></button>
    <div className="reader-mobile-progress"><span>Page {currentPage} of {pageCount}</span><progress value={progress} max={100} aria-label={`Page ${currentPage} of ${pageCount}`} /></div>
    <button className={isBookmarked ? 'saved' : ''} type="button" onClick={onBookmark} aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}><Bookmark aria-hidden="true" fill={isBookmarked ? 'currentColor' : 'none'} /></button>
  </footer>
}

function ReaderPanel({ panel, issue, outline, bookmarks, currentPage, isBookmarked, pdf, searchTerm, searchStatus, onClose, onJump, onBookmark, onSearchChange, onSearchSubmit, onSearchKeyDown }: {
  panel: Exclude<Panel, null>
  issue: Issue
  outline: OutlineRow[]
  bookmarks: number[]
  currentPage: number
  isBookmarked: boolean
  pdf: ReaderPdf | null
  searchTerm: string
  searchStatus: string
  onClose: () => void
  onJump: (page: number) => void
  onBookmark: () => void
  onSearchChange: (value: string) => void
  onSearchSubmit: (event: FormEvent<HTMLFormElement>) => void
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  async function jumpToOutline(item: OutlineRow) {
    if (!pdf || !item.dest) return
    try {
      const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
      if (Array.isArray(destination) && destination[0]) {
        const index = await pdf.getPageIndex(destination[0] as Parameters<typeof pdf.getPageIndex>[0])
        onJump(index + 1)
      }
    } catch {
      return
    }
  }

  return <>
    <button className="reader-panel-backdrop" onClick={onClose} aria-label="Close reader panel" />
    <aside className="reader-panel" role="dialog" aria-modal="true" aria-label={panel === 'contents' ? 'Table of contents' : panel === 'bookmarks' ? 'Bookmarks' : 'Search issue'}>
      <div className="reader-panel-heading"><div><span className="eyebrow">{panel === 'contents' ? 'Issue navigation' : panel === 'bookmarks' ? 'Saved pages' : 'Find in issue'}</span><h2 className="editorial">{panel === 'contents' ? 'Contents' : panel === 'bookmarks' ? 'Bookmarks' : 'Search this issue'}</h2></div><button type="button" onClick={onClose} aria-label="Close panel"><X aria-hidden="true" /></button></div>
      {panel === 'contents' && (outline.length ? <nav className="reader-outline" aria-label="Issue contents">{outline.map((item, index) => <button key={`${item.title}-${index}`} type="button" style={{ paddingLeft: 16 + item.depth * 18 }} onClick={() => void jumpToOutline(item)}>{item.title}</button>)}</nav> : <p className="reader-panel-note">{pdf ? 'This e-copy does not include a table of contents.' : issue.fileUrl ? 'Loading the table of contents…' : 'The table of contents will be available when the full e-copy is uploaded.'}</p>)}
      {panel === 'bookmarks' && <div className="reader-bookmark-current"><span>Current position · Page {currentPage}</span><button className="secondary-button" type="button" onClick={onBookmark}>{isBookmarked ? 'Remove current bookmark' : 'Bookmark this page'}</button></div>}
      {panel === 'bookmarks' && (bookmarks.length ? <div className="reader-outline">{bookmarks.map((page) => <button key={page} type="button" onClick={() => onJump(page)}><Bookmark aria-hidden="true" /> Page {page}{page === currentPage ? ' · Current' : ''}</button>)}</div> : <p className="reader-panel-note">No saved pages yet. Use the bookmark control to save your place.</p>)}
      {panel === 'search' && <form className="reader-search-form" onSubmit={onSearchSubmit}><label htmlFor="reader-search">Search words in this edition</label><input id="reader-search" type="search" value={searchTerm} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={onSearchKeyDown} placeholder="Type a name or topic" /><button className="primary-button" type="submit" disabled={!pdf}>Search</button>{searchStatus && <p role="status">{searchStatus}</p>}</form>}
      <div className="reader-panel-issue"><strong>{issue.title}</strong><span>{issue.date} · {issue.industry}</span></div>
    </aside>
  </>
}

function ReaderPreview({ issue, loading, error }: { issue: Issue; loading: boolean; error: string }) {
  if (loading) return <div className="reader-unavailable"><div className="reader-loading-indicator" aria-live="polite">Opening your e-copy…</div></div>
  return <div className="reader-unavailable" role={error ? 'alert' : 'status'}><h1 className="editorial">{error ? 'Unable to open this issue' : 'PDF not available'}</h1><p>{error || `The PDF for “${issue.title}” has not been uploaded yet.`}</p></div>
}
