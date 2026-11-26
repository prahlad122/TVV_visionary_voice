'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Shows the loader the moment an internal link is clicked. app/loading.tsx only appears once
 * the server answers, which on a slow connection (or while the dev server compiles a page)
 * leaves the old page sitting there with no feedback. This covers that gap and is hidden as
 * soon as the new page (or its loading.tsx) takes over.
 */
export function NavigationProgress() {
  const pathname = usePathname()
  const [active, setActive] = useState(false)

  // The address has changed: the new page or its loader is now on screen.
  useEffect(() => { setActive(false) }, [pathname])

  useEffect(() => {
    // Listens in the capture phase, before next/link's own handler, which always cancels the
    // browser's navigation (preventDefault) to switch pages itself.
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download') || (link.target && link.target !== '_self')) return
      const url = new URL(link.href, window.location.href)
      // Only page changes on this site: not files (the PDF/asset API), other sites or #anchors.
      if (url.origin !== window.location.origin || url.pathname.startsWith('/api/')) return
      if (url.pathname === window.location.pathname) return
      setActive(true)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  // Never leave the loader up if a navigation is abandoned.
  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => setActive(false), 20_000)
    return () => window.clearTimeout(timer)
  }, [active])

  if (!active) return null
  return <>
    <div className="nav-progress" aria-hidden="true"><span /></div>
    {/* The full-page loader fades in only if the page is still not ready after a moment,
        so quick (prefetched) navigations show just the thin bar. */}
    <div className="page-loader nav-progress-overlay" role="status" aria-live="polite">
      <span className="page-loader-wordmark"><span className="wordmark-the">The</span> Visionary Voice</span>
      <span className="page-loader-bar" aria-hidden="true"><span /></span>
      <span className="page-loader-label">Loading…</span>
    </div>
  </>
}
