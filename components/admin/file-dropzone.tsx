'use client'

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Upload, X } from 'lucide-react'

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * A dashed "click or drop a file here" area around a real file input, so the
 * surrounding form still reads the file from FormData under `name`.
 */
export function FileDropzone({ name, label, accept, hint, icon, className = '' }: {
  name: string
  label: string
  accept: string
  /** e.g. "PDF up to 400 MB" */
  hint: string
  icon?: ReactNode
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  // Clear the shown file when the form is reset after a successful upload.
  useEffect(() => {
    const form = input.current?.form
    if (!form) return
    const onReset = () => setFile(null)
    form.addEventListener('reset', onReset)
    return () => form.removeEventListener('reset', onReset)
  }, [])

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files
    if (!dropped.length || !input.current) return
    const transfer = new DataTransfer()
    transfer.items.add(dropped[0])
    input.current.files = transfer.files
    setFile(dropped[0])
  }

  function clear() {
    if (input.current) input.current.value = ''
    setFile(null)
  }

  return <div className={`admin-field dropzone-field ${className}`}>
    <span className="dropzone-label">{label}</span>
    <label
      className={`dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input ref={input} className="dropzone-input" name={name} type="file" accept={accept} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      <span className="dropzone-icon" aria-hidden="true">{icon ?? <Upload />}</span>
      {file
        ? <span className="dropzone-text"><strong>{file.name}</strong><small>{formatSize(file.size)} · Click to choose a different file</small></span>
        : <span className="dropzone-text"><strong><u>Click to upload</u> or drag and drop</strong><small>{hint}</small></span>}
    </label>
    {file && <button type="button" className="dropzone-clear" onClick={clear}><X aria-hidden="true" /> Remove file</button>}
  </div>
}
