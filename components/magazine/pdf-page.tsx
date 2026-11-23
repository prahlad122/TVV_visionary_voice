'use client'

import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'

export type ReaderPdf = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>

export function PdfPageCanvas({ document, pageNumber, zoom }: { document: ReaderPdf; pageNumber: number; zoom: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hostWidth, setHostWidth] = useState(0)
  const [hostHeight, setHostHeight] = useState(0)
  const [error, setError] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect
      setHostWidth(bounds?.width ?? 0)
      setHostHeight(bounds?.height ?? 0)
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!hostWidth || !hostHeight || pageNumber > document.numPages) return
    let cancelled = false
    let renderTask: { cancel: () => void } | undefined
    async function renderPage() {
      try {
        const page = await document.getPage(pageNumber)
        if (cancelled) return
        const baseViewport = page.getViewport({ scale: 1 })
        // Keep a small inset so fractional PDF dimensions and device-pixel
        // rounding never crop an edge at the default fit-to-page zoom.
        const fitScale = Math.min((hostWidth - 8) / baseViewport.width, (hostHeight - 8) / baseViewport.height)
        const zoomScale = zoom / 100
        const scale = fitScale * zoomScale
        const viewport = page.getViewport({ scale })
        const visibleCanvas = canvasRef.current
        const renderCanvas = window.document.createElement('canvas')
        const context = renderCanvas.getContext('2d', { alpha: false })
        if (!visibleCanvas || !context) throw new Error('Canvas unavailable')

        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
        renderCanvas.width = Math.floor(viewport.width * pixelRatio)
        renderCanvas.height = Math.floor(viewport.height * pixelRatio)
        const task = page.render({
          canvas: renderCanvas,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: '#ffffff',
        })
        renderTask = task
        await task.promise
        if (!cancelled) {
          visibleCanvas.width = renderCanvas.width
          visibleCanvas.height = renderCanvas.height
          // The spread is scaled as one unit for scrolling. Render at zoom
          // resolution while preserving the canvas's pre-transform size.
          visibleCanvas.style.width = `${viewport.width / zoomScale}px`
          visibleCanvas.style.height = `${viewport.height / zoomScale}px`
          visibleCanvas.getContext('2d', { alpha: false })?.drawImage(renderCanvas, 0, 0)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      }
    }

    void renderPage()
    return () => {
      cancelled = true
      renderTask?.cancel()
    }
  }, [document, hostHeight, hostWidth, pageNumber, zoom])

  if (pageNumber > document.numPages) return <div className="reader-blank-page" aria-hidden="true" />

  return (
    <div className="reader-canvas-host" ref={hostRef} aria-label={`Page ${pageNumber}`}>
      {error && <span className="reader-page-status" role="alert">This page could not be displayed.</span>}
      <canvas ref={canvasRef} className="reader-pdf-canvas" aria-label={`Magazine page ${pageNumber}`} />
    </div>
  )
}
