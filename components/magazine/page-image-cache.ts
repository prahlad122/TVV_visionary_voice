import type * as pdfjsLib from 'pdfjs-dist'

export type ReaderPdf = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>

/**
 * Options for opening very large PDFs (hundreds of MB) quickly.
 *
 * pdf.js normally streams the whole file in the background after the first
 * page appears. With auto-fetch and streaming disabled it only requests the
 * byte ranges a rendered page needs, so the reader opens after a few MB
 * instead of waiting on (or competing with) a 300 MB download. The API route
 * already answers Range requests with 206 responses.
 */
export const LARGE_PDF_OPTIONS = {
  disableAutoFetch: true,
  disableStream: true,
  rangeChunkSize: 1024 * 1024,
} as const

export type PageJob = { page: number; width: number; priority: number }
type Entry = { page: number; width: number; url: string }

/** Largest bitmap width we render; keeps memory bounded on 4K / zoomed screens. */
export const MAX_RENDER_WIDTH = 2400

const keyOf = (page: number, width: number) => `${page}@${width}`

async function renderPageToUrl(pdf: ReaderPdf, pageNumber: number, width: number) {
  const page = await pdf.getPage(pageNumber)
  try {
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: width / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport, background: '#ffffff' }).promise
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('Page could not be encoded.'))), 'image/jpeg', 0.92)
    })
    // Release the bitmap immediately; the JPEG object URL is all we keep.
    canvas.width = 0
    canvas.height = 0
    return URL.createObjectURL(blob)
  } finally {
    page.cleanup()
  }
}

/**
 * Renders PDF pages to image URLs one at a time, highest priority first, and
 * keeps a small LRU of the results. Rendering pages to images (rather than
 * drawing into on-screen canvases) lets the book show the same page in two
 * places during a flip and makes turning back to a recent spread instant.
 */
export class PageImageCache {
  private entries = new Map<string, Entry>()
  private failed = new Set<number>()
  private wanted: PageJob[] = []
  private running = false
  private destroyed = false
  private version = 0
  private listeners = new Set<() => void>()

  constructor(private readonly pdf: ReaderPdf, private readonly maxEntries = 24) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getVersion = () => this.version

  /** The rendered image closest to the requested width, so resizes and zooms never flash blank. */
  get(page: number, width: number): string | undefined {
    let best: Entry | undefined
    for (const entry of this.entries.values()) {
      if (entry.page !== page) continue
      if (!best || Math.abs(entry.width - width) < Math.abs(best.width - width)) best = entry
    }
    return best?.url
  }

  hasFailed(page: number) {
    return this.failed.has(page)
  }

  /** Replace the render queue. Jobs that are no longer wanted are dropped before they start. */
  request(jobs: PageJob[]) {
    this.wanted = jobs
      .filter((job) => job.page >= 1 && job.page <= this.pdf.numPages)
      .sort((a, b) => a.priority - b.priority)
    void this.pump()
  }

  destroy() {
    this.destroyed = true
    this.wanted = []
    for (const entry of this.entries.values()) URL.revokeObjectURL(entry.url)
    this.entries.clear()
    this.listeners.clear()
  }

  private async pump() {
    if (this.running) return
    this.running = true
    try {
      while (!this.destroyed) {
        const job = this.wanted.find((item) => !this.entries.has(keyOf(item.page, item.width)) && !this.failed.has(item.page))
        if (!job) break
        try {
          const url = await renderPageToUrl(this.pdf, job.page, job.width)
          if (this.destroyed) {
            URL.revokeObjectURL(url)
            break
          }
          this.entries.set(keyOf(job.page, job.width), { page: job.page, width: job.width, url })
          this.evict()
        } catch {
          if (this.destroyed) break
          this.failed.add(job.page)
        }
        this.version += 1
        this.listeners.forEach((listener) => listener())
      }
    } finally {
      this.running = false
    }
  }

  private evict() {
    if (this.entries.size <= this.maxEntries) return
    const keep = new Set(this.wanted.map((job) => keyOf(job.page, job.width)))
    // A wanted page whose exact-width render is not ready yet is still shown
    // from an older render; revoking that URL would blank the page on screen.
    const pendingPages = new Set(this.wanted.filter((job) => !this.entries.has(keyOf(job.page, job.width))).map((job) => job.page))
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= this.maxEntries) break
      if (keep.has(key) || pendingPages.has(entry.page)) continue
      URL.revokeObjectURL(entry.url)
      this.entries.delete(key)
    }
  }
}
