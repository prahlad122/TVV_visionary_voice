'use client'

import * as pdfjs from 'pdfjs-dist'
import { uploadToStorage } from '@/lib/upload'
import { LARGE_PDF_OPTIONS } from '@/components/magazine/page-image-cache'
import type { PageImage } from '@/lib/db/schema'
import { tidyExtractedText } from '@/lib/text-tidy'
import { discardPageUploads } from '@/lib/actions/admin'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type PdfDocument = Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>
type PdfPage = Awaited<ReturnType<PdfDocument['getPage']>>

export type ExtractedPage = { number: number; text: string }
export type PdfTextResult = {
  pages: ExtractedPage[]
  /** Pages joined with blank lines, ready to store as the issue's article text. */
  text: string
  pageCount: number
  /** False when no page has readable text because the PDF's fonts map to unreadable glyphs. */
  readable: boolean
  /** Pages that had text, but text too garbled to keep. */
  unreadablePages: number
}

/** Width of the reader's page images. Sharp for a two-page spread on a 1440p / retina screen, ~150–400 KB each. */
const PAGE_IMAGE_WIDTH = 1600
const PAGE_IMAGE_MAX_HEIGHT = 2600
const PARALLEL_UPLOADS = 3

// Some exported magazines embed fonts whose glyphs map to control characters.
// This map fixes the ones seen in the AI Native Flagship Program PDF.
const flagshipGlyphMap: Record<string, string> = {
  '\u0002': 'r', '\u000E': 'r', '\u0010': 'r', '\u001D': '-',
  '\u0084': '(', '\u0085': ')', '\u0093': '-', '\u009E': '-',
}

async function pageText(page: PdfPage) {
  const content = await page.getTextContent()
  let previousY: number | null = null
  return content.items.map((item) => {
    if (!('str' in item)) return ''
    const y = item.transform[5]
    const gap = previousY === null ? 0 : Math.abs(y - previousY)
    const separator = gap > Math.max(12, (item.height ?? 10) * 1.45) ? '\n\n' : gap > 2 ? '\n' : ' '
    previousY = y
    return `${separator}${item.str}`
  }).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function finishText(rawPages: ExtractedPage[], pageCount: number, title = ''): PdfTextResult {
  const rawText = rawPages.map((page) => page.text).join(' ')
  const flagshipPdf = /ai\s*native\s*flagship\s*program/i.test(title)
    || (/AI[\s\u001D-]+NATIVE/i.test(rawText) && /FLAGSHIP\s+PROGRAM/i.test(rawText) && /FELLOWSHIP/i.test(rawText))
  const pages = rawPages.map((page) => ({
    ...page,
    text: tidyExtractedText(flagshipPdf ? page.text.replace(/[\u0002\u000E\u0010\u001D\u0084\u0085\u0093\u009E]/g, (glyph) => flagshipGlyphMap[glyph] ?? glyph) : page.text),
  }))
  // Line breaks are expected; other control characters (and box glyphs) mean a font's glyphs
  // are unmapped. Judge each page on its own: a page with a few stray glyphs keeps its text
  // with them removed, and a page that is mostly garbled is left out. One bad font on one page
  // no longer throws away the text of the whole issue.
  const kept = pages.flatMap((page) => {
    const letters = page.text.replace(/\s/g, '').length
    const bad = page.text.replace(/\n/g, '').match(/[\p{C}■-◿]/gu)?.length ?? 0
    if (!letters || bad / letters > 0.02) return []
    const clean = bad ? page.text.replace(/[^\n\P{C}]|[■-◿]/gu, '').replace(/[ \t]{2,}/g, ' ').trim() : page.text
    return clean ? [{ ...page, text: clean }] : []
  })
  const text = kept.map((page) => page.text).join('\n\n')
  return { pages: kept, text, pageCount, readable: kept.length > 0 || !pages.length, unreadablePages: pages.length - kept.length }
}

function openPdf(source: { data: ArrayBuffer } | { url: string }) {
  return pdfjs.getDocument('data' in source
    // pdf.js transfers the buffer to its worker, so the caller's copy is detached afterwards.
    ? { data: new Uint8Array(source.data) }
    : { url: source.url, withCredentials: true, ...LARGE_PDF_OPTIONS })
}

/** Extract readable text from a PDF, page by page. */
export async function extractPdfText(
  source: { data: ArrayBuffer } | { url: string },
  options: { title?: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<PdfTextResult> {
  const task = openPdf(source)
  const abort = () => { void task.destroy() }
  options.signal?.addEventListener('abort', abort)
  try {
    const pdf = await task.promise
    const rawPages: ExtractedPage[] = []
    for (let number = 1; number <= pdf.numPages; number += 1) {
      if (options.signal?.aborted) throw new DOMException('Text extraction was cancelled.', 'AbortError')
      try {
        const page = await pdf.getPage(number)
        const text = await pageText(page)
        if (text) rawPages.push({ number, text })
        page.cleanup()
      } catch { /* Continue extracting other pages if one page is damaged. */ }
      options.onProgress?.(number, pdf.numPages)
    }
    return finishText(rawPages, pdf.numPages, options.title)
  } finally {
    options.signal?.removeEventListener('abort', abort)
    void task.destroy()
  }
}

async function renderPageImage(page: PdfPage) {
  const base = page.getViewport({ scale: 1 })
  const scale = Math.min(PAGE_IMAGE_WIDTH / base.width, PAGE_IMAGE_MAX_HEIGHT / base.height)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  const encode = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // WebP is far smaller than JPEG for magazine art; browsers that cannot encode WebP return PNG, so fall back to JPEG.
  let blob = await encode('image/webp', 0.82)
  if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.85)
  const size = { width: canvas.width, height: canvas.height }
  canvas.width = 0
  canvas.height = 0
  if (!blob) throw new Error('A page image could not be encoded.')
  return { blob, ...size }
}

/**
 * Prepare an uploaded PDF for readers in one pass: extract every page's text
 * and render every page to a screen-sized image uploaded to R2 storage.
 * The original PDF is untouched and remains the download.
 */
export async function preparePdfForReaders(
  source: { data: ArrayBuffer },
  options: {
    issueId: string
    userId: string
    title?: string
    onProgress?: (message: string) => void
    /** Called each time a page image finishes uploading, so callers can show real progress. */
    onPagesDone?: (done: number, total: number) => void
  },
): Promise<{ text: PdfTextResult; pageImages: PageImage[] }> {
  const task = openPdf(source)
  const inFlight = new Set<Promise<void>>()
  const uploadedPaths: string[] = []
  let uploadError: unknown = null
  try {
    const pdf = await task.promise
    const total = pdf.numPages
    const rawPages: ExtractedPage[] = []
    const pageImages: PageImage[] = new Array(total)
    options.onPagesDone?.(0, total)

    for (let number = 1; number <= total; number += 1) {
      if (uploadError) throw uploadError
      options.onProgress?.(`Reader pages: rendering page ${number} of ${total}, ${uploadedPaths.length} uploaded`)
      const page = await pdf.getPage(number)
      try {
        try {
          const text = await pageText(page)
          if (text) rawPages.push({ number, text })
        } catch { /* A page without readable text still gets an image. */ }
        const image = await renderPageImage(page)
        const extension = image.blob.type === 'image/webp' ? 'webp' : 'jpg'
        const pending: Promise<void> = uploadToStorage(image.blob, {
          issueId: options.issueId,
          assetType: 'page',
          filename: `pages/page-${String(number).padStart(4, '0')}.${extension}`,
        }).then((key) => {
          uploadedPaths.push(key)
          pageImages[number - 1] = { path: key, width: image.width, height: image.height }
          options.onPagesDone?.(uploadedPaths.length, total)
        }).catch((error: unknown) => {
          uploadError ??= error
        }).finally(() => {
          inFlight.delete(pending)
        })
        inFlight.add(pending)
        if (inFlight.size >= PARALLEL_UPLOADS) await Promise.race(inFlight)
      } finally {
        page.cleanup()
      }
    }
    options.onProgress?.(`Reader pages: all ${total} rendered, ${uploadedPaths.length} uploaded`)
    await Promise.all(inFlight)
    if (uploadError) throw uploadError
    options.onProgress?.(`Reader pages: all ${total} uploaded`)
    return { text: finishText(rawPages, total, options.title), pageImages }
  } catch (error) {
    // Don't leave a half-finished set of page images using storage.
    await Promise.allSettled([...inFlight])
    if (uploadedPaths.length) {
      options.onProgress?.('Removing the partial upload…')
      await discardPageUploads(options.issueId, uploadedPaths).catch((cleanupError: unknown) => {
        console.error('Could not remove partial page uploads:', cleanupError)
      })
    }
    throw error
  } finally {
    void task.destroy()
  }
}
