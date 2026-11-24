'use client'

import { type MouseEvent as ReactMouseEvent, type TouchEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MAX_RENDER_WIDTH, PageImageCache, type PageJob, type ReaderPdf } from './page-image-cache'

type Direction = 'next' | 'prev'
type Flip = { id: number; dir: Direction; from: number; to: number }
type Slots = { left: number | null; right: number | null }

const FLIP_MS = 700
const STAGE_PADDING = 24
const noopSubscribe = () => () => {}
const zeroVersion = () => 0

/*
 * Spread numbering (two-page mode), like a printed magazine:
 *   spread 0 = [ — , 1 ]   the cover sits alone on the right of the binding
 *   spread 1 = [ 2 , 3 ]
 *   spread s = [ 2s, 2s+1 ]
 * In single-page mode (phones) spread s is simply page s.
 */
function spreadOf(page: number, single: boolean) {
  return single ? Math.max(1, page) : Math.floor(Math.max(1, page) / 2)
}

function slotsOf(spread: number, single: boolean, pageCount: number): Slots {
  if (single) return { left: null, right: spread }
  const left = spread * 2
  const right = spread * 2 + 1
  return { left: left >= 1 && left <= pageCount ? left : null, right: right <= pageCount ? right : null }
}

/** The page number reported to the toolbar for a spread. */
function firstPageOf(spread: number, single: boolean) {
  if (single) return spread
  return spread === 0 ? 1 : spread * 2
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

export function BookViewer({ pdf, page, zoom, singlePage, onPageChange }: {
  pdf: ReaderPdf
  page: number
  zoom: number
  singlePage: boolean
  onPageChange: (page: number) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  const [aspect, setAspect] = useState(1 / Math.SQRT2) // A4 portrait until page 1 is measured
  const [flip, setFlip] = useState<Flip | null>(null)
  const [cache, setCache] = useState<PageImageCache | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const pageCount = pdf.numPages
  const single = singlePage
  const spread = spreadOf(Math.min(page, pageCount), single)
  const firstSpread = single ? 1 : 0
  const lastSpread = single ? pageCount : Math.floor(pageCount / 2)
  const canGoPrev = spread > firstSpread
  const canGoNext = spread < lastSpread
  // A flip only applies while the reader is still on the flip's target spread;
  // jumping elsewhere (contents, page box) simply drops the animation.
  const activeFlip = flip && flip.to === spread ? flip : null

  // One render cache per document. Created in an effect so React Strict Mode's
  // mount/unmount/mount cycle never leaves a destroyed cache in use.
  useEffect(() => {
    const next = new PageImageCache(pdf)
    setCache(next)
    return () => next.destroy()
  }, [pdf])
  useSyncExternalStore(cache?.subscribe ?? noopSubscribe, cache?.getVersion ?? zeroVersion, zeroVersion)

  useEffect(() => {
    let cancelled = false
    pdf.getPage(1).then((first) => {
      const viewport = first.getViewport({ scale: 1 })
      if (!cancelled && viewport.width > 0 && viewport.height > 0) setAspect(viewport.width / viewport.height)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [pdf])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect
      if (bounds) setStage({ width: bounds.width, height: bounds.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Fit two pages (or one on phones) inside the stage, then apply zoom.
  const columns = single ? 1 : 2
  const availableWidth = Math.max(0, stage.width - STAGE_PADDING * 2)
  const availableHeight = Math.max(0, stage.height - STAGE_PADDING * 2)
  const fitHeight = Math.min(availableHeight, availableWidth / columns / aspect)
  const pageHeight = Math.floor(fitHeight * (zoom / 100))
  const pageWidth = Math.floor(pageHeight * aspect)
  const pixelRatio = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  // Bucket the bitmap width so small resizes reuse existing renders.
  const renderWidth = pageWidth ? Math.min(MAX_RENDER_WIDTH, Math.ceil((pageWidth * pixelRatio) / 160) * 160) : 0

  // Render the visible spread first, then the next, previous and one beyond,
  // so a click flips onto pages that are already painted.
  useEffect(() => {
    if (!cache || !renderWidth) return
    const jobs: PageJob[] = []
    ;[spread, spread + 1, spread - 1, spread + 2].forEach((target, priority) => {
      if (target < firstSpread || target > lastSpread) return
      const { left, right } = slotsOf(target, single, pageCount)
      for (const pageNumber of [left, right]) if (pageNumber) jobs.push({ page: pageNumber, width: renderWidth, priority })
    })
    cache.request(jobs)
  }, [cache, firstSpread, lastSpread, pageCount, renderWidth, single, spread])

  function turn(dir: Direction) {
    if (dir === 'next' ? !canGoNext : !canGoPrev) return
    const to = spread + (dir === 'next' ? 1 : -1)
    onPageChange(firstPageOf(to, single))
    setFlip(reducedMotion ? null : { id: Date.now(), dir, from: spread, to })
  }

  // Keep the latest turn() for the window key listener without re-binding it every render.
  const turnRef = useRef(turn)
  useEffect(() => { turnRef.current = turn })
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); turnRef.current('next') }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); turnRef.current('prev') }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function beginTouch(event: TouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function finishTouch(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current
    touchStart.current = null
    if (!start || zoom > 100) return
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - start.x
    if (Math.abs(deltaX) > 56 && Math.abs(deltaX) > Math.abs(touch.clientY - start.y)) turn(deltaX < 0 ? 'next' : 'prev')
  }

  // What sits underneath the turning leaf, and what is printed on each side of the leaf.
  const current = slotsOf(spread, single, pageCount)
  let base: Slots = current
  let leaf: { front: number | null; back: number | null } | null = null
  if (activeFlip) {
    const from = slotsOf(activeFlip.from, single, pageCount)
    const to = current
    if (single) {
      // Phones: the old page swings away to reveal the next one, or the previous page swings back in.
      base = activeFlip.dir === 'next' ? to : from
      leaf = { front: activeFlip.dir === 'next' ? from.right : to.right, back: null }
    } else if (activeFlip.dir === 'next') {
      base = { left: from.left, right: to.right }
      leaf = { front: from.right, back: to.left }
    } else {
      base = { left: to.left, right: from.right }
      leaf = { front: from.left, back: to.right }
    }
  }

  const image = (pageNumber: number | null) => (pageNumber && cache && renderWidth ? cache.get(pageNumber, renderWidth) : undefined)
  const pagesLabel = [current.left, current.right].filter(Boolean).join(' and ')

  return (
    <div className="book-stage" ref={stageRef} onTouchStart={beginTouch} onTouchEnd={finishTouch}>
      {pageWidth > 0 && (
        <div
          className={`book${single ? ' is-single' : ''}${activeFlip ? ' is-flipping' : ''}`}
          style={{ width: pageWidth * columns, height: pageHeight, ['--flip-ms' as string]: `${FLIP_MS}ms` }}
          role="group"
          aria-roledescription="book"
          aria-label={`Page${current.left && current.right ? 's' : ''} ${pagesLabel} of ${pageCount}`}
        >
          {!single && (
            <PageSide
              side="left"
              pageNumber={base.left}
              src={image(base.left)}
              failed={Boolean(base.left && cache?.hasFailed(base.left))}
              disabled={!canGoPrev}
              label="Previous pages"
              onClick={() => turn('prev')}
            />
          )}
          <PageSide
            side="right"
            pageNumber={base.right}
            src={image(base.right)}
            failed={Boolean(base.right && cache?.hasFailed(base.right))}
            disabled={!canGoNext && !single}
            label={single ? 'Turn page' : 'Next pages'}
            onClick={(event) => {
              if (!single) return turn('next')
              // Phones: tap the left third to go back, anywhere else to go forward.
              const bounds = event.currentTarget.getBoundingClientRect()
              turn(event.clientX - bounds.left < bounds.width / 3 ? 'prev' : 'next')
            }}
          />
          {!single && (current.left || current.right) && <div className="book-binding" aria-hidden="true" />}
          {activeFlip && leaf && (
            <div
              key={activeFlip.id}
              className={`book-leaf is-${activeFlip.dir}`}
              aria-hidden="true"
              onAnimationEnd={(event) => { if (event.target === event.currentTarget) setFlip(null) }}
            >
              <LeafFace className="book-leaf-front" src={image(leaf.front)} blank={!leaf.front} />
              <LeafFace className="book-leaf-back" src={image(leaf.back)} blank={!leaf.back} />
            </div>
          )}
        </div>
      )}
      <button className="reader-edge-button reader-previous" type="button" aria-label="Previous pages" disabled={!canGoPrev} onClick={() => turn('prev')}><ChevronLeft aria-hidden="true" /></button>
      <button className="reader-edge-button reader-next" type="button" aria-label="Next pages" disabled={!canGoNext} onClick={() => turn('next')}><ChevronRight aria-hidden="true" /></button>
    </div>
  )
}

function PageSide({ side, pageNumber, src, failed, disabled, label, onClick }: {
  side: 'left' | 'right'
  pageNumber: number | null
  src?: string
  failed: boolean
  disabled: boolean
  label: string
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  // No page on this side (the cover's left, or after an even last page): leave
  // the space empty so the book reads as closed on that side.
  if (!pageNumber) return <div className={`book-page book-page-${side} is-empty`} aria-hidden="true" />
  return (
    <button className={`book-page book-page-${side}`} type="button" disabled={disabled} aria-label={`${label} (page ${pageNumber})`} onClick={onClick}>
      {src
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs rendered in the browser cannot go through next/image
        ? <img src={src} alt="" draggable={false} decoding="async" />
        : <span className="book-page-status">{failed ? 'This page could not be displayed.' : `Loading page ${pageNumber}…`}</span>}
    </button>
  )
}

function LeafFace({ className, src, blank }: { className: string; src?: string; blank: boolean }) {
  return (
    <div className={`book-leaf-face ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- blob: URLs cannot go through next/image */}
      {!blank && src && <img src={src} alt="" draggable={false} />}
    </div>
  )
}
