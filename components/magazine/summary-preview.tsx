'use client'

import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { SummaryArticle } from './summary-article'

/**
 * A summary shown as its first few lines, fading out, with a button that opens
 * the rest. The button is hidden when the whole summary already fits.
 */
export function SummaryPreview({ summary, headingLevel = 2, lines = 4, moreLabel = 'Read the full brief', children }: {
  summary: string
  headingLevel?: 2 | 3 | 5
  /** Roughly how many lines show while it is closed. */
  lines?: number
  moreLabel?: string
  /** Shown under the summary only once it is opened. */
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    const body = bodyRef.current
    if (!body || open) return
    const check = () => setOverflows(body.scrollHeight > body.clientHeight + 4)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(body)
    return () => observer.disconnect()
  }, [open, summary])

  const expandable = overflows || Boolean(children)
  return <div className={open ? 'summary-clamp is-open' : 'summary-clamp'} style={{ '--summary-lines': lines } as CSSProperties}>
    <div id={id} ref={bodyRef} className={overflows && !open ? 'summary-clamp-body is-clipped' : 'summary-clamp-body'}>
      <SummaryArticle summary={summary} headingLevel={headingLevel} />
    </div>
    {open && children}
    {expandable && <button className="summary-clamp-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      {open ? 'Show less' : moreLabel} <span aria-hidden="true">{open ? '↑' : '↓'}</span>
    </button>}
  </div>
}
