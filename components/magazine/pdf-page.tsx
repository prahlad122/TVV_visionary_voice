'use client'

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

export type ReaderPdf = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>

export function PdfPageCanvas({ document, pageNumber, zoom }: { document: ReaderPdf; pageNumber: number; zoom: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hostWidth, setHostWidth] = useState(0)
  const [rendering, setRendering] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => setHostWidth(entries[0]?.contentRect.width ?? 0))
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!hostWidth || pageNumber > document.numPages) return
    let cancelled = false
    let renderTask: { cancel: () => void } | undefined
    setRendering(true)
    setError(false)

    async function renderPage() {
      try {
        const page = await document.getPage(pageNumber)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = (hostWidth / baseViewport.width) * (zoom / 100)
        const viewport = page.getViewport({ scale })
        const canvas = canvasRef.current
        const context = canvas?.getContext('2d', { alpha: false })
        if (!canvas || !context) throw new Error('Canvas unavailable')

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${viewport.width}px`
        canvas.style.height = `${viewport.height}px`
        const task = page.render({
          canvas,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: '#ffffff',
        })
        renderTask = task
        await task.promise
        if (!cancelled) setRendering(false)
      } catch {
        if (!cancelled) {
          setError(true)
          setRendering(false)
        }
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [document, hostWidth, pageNumber, zoom])

  if (pageNumber > document.numPages) return <div className="reader-blank-page" aria-hidden="true" />

  return (
    <div className="reader-canvas-host" ref={hostRef} aria-label={`Page ${pageNumber}`}>
      {rendering && <span className="reader-page-status">Preparing page {pageNumber}…</span>}
      {error && <span className="reader-page-status" role="alert">This page could not be displayed.</span>}
      <canvas ref={canvasRef} className="reader-pdf-canvas" aria-label={`Magazine page ${pageNumber}`} />
    </div>
  )
}
