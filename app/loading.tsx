/**
 * Shown by Next.js while any page under the root layout is loading (first visit or
 * navigation between pages), until the page's content is ready.
 */
export default function Loading() {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <span className="page-loader-wordmark"><span className="wordmark-the">The</span> Visionary Voice</span>
      <span className="page-loader-bar" aria-hidden="true"><span /></span>
      <span className="page-loader-label">Loading…</span>
    </div>
  )
}
