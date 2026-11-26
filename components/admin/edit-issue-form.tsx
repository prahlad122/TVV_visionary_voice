'use client'

import { type FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react'
import { uploadToStorage } from '@/lib/upload'
import { FileDropzone } from './file-dropzone'
import { SummaryArticle } from '@/components/magazine/summary-article'
import { deleteMagazineIssue, discardPageUploads, editMagazineIssue, regenerateIssueSummary } from '@/lib/actions/admin'
import type { PageImage } from '@/lib/db/schema'

/** Matches the server limit in lib/actions/admin.ts. */
const MAX_ARTICLE_CHARS = 1_000_000

export type EditableIssue = {
  id: string
  title: string
  description: string
  industry: string
  region: string
  issueDate: string
  articleText: string
  summary: string
  summaryStatus: string
  summaryModel: string
  coverUrl: string | null
  fileUrl: string | null
  fileName: string
  fileSize: number
  pageCount: number
  published: boolean
  featured: boolean
  updatedAt: string
}

type Fields = Pick<EditableIssue, 'title' | 'description' | 'industry' | 'region' | 'issueDate' | 'articleText' | 'summary' | 'published' | 'featured'>

function fieldsOf(issue: EditableIssue): Fields {
  return {
    title: issue.title,
    description: issue.description,
    industry: issue.industry,
    region: issue.region,
    issueDate: issue.issueDate,
    articleText: issue.articleText,
    summary: issue.summary,
    published: issue.published,
    featured: issue.featured,
  }
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Formatted in the browser only: the server's locale and time zone differ from the editor's. */
function SavedAt({ iso }: { iso: string }) {
  const [text, setText] = useState('')
  useEffect(() => { setText(new Date(iso).toLocaleString()) }, [iso])
  return <time dateTime={iso}>{text}</time>
}

function summarySource(issue: EditableIssue) {
  if (issue.summaryStatus === 'pending') return 'A new summary is being generated. It appears here when it is ready.'
  if (issue.summaryStatus === 'failed') return 'The last summary attempt failed. Write one below, or try regenerating it.'
  if (!issue.summary) return 'No summary yet. Write one below, or generate it with AI.'
  if (issue.summaryModel === 'edited') return 'Edited by hand. Regenerating replaces it with an AI summary.'
  if (issue.summaryModel) return `Written by AI (${issue.summaryModel}). Edit it below to correct or shorten it.`
  return 'Built from the issue’s own sentences, because no AI model was available.'
}

/**
 * The admin "Edit magazine" page: every detail of an uploaded issue, its cover,
 * its PDF (with new reader pages and summary), its article text and its summary.
 */
export function EditIssueForm({ issue, userId }: { issue: EditableIssue; userId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [fields, setFields] = useState<Fields>(() => fieldsOf(issue))
  const [summaryEdited, setSummaryEdited] = useState(false)
  const [removeCover, setRemoveCover] = useState(false)
  const [filesChosen, setFilesChosen] = useState(false)
  // Changing this key remounts the file inputs, clearing them after a save or discard.
  const [fileKey, setFileKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [progress, setProgress] = useState<{ stage: string; percent: number | null; detail: string } | null>(null)

  const original = fieldsOf(issue)
  const changed = (Object.keys(original) as (keyof Fields)[]).filter((key) => fields[key] !== original[key])
  const dirty = changed.length > 0 || removeCover || filesChosen
  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((current) => ({ ...current, [key]: value }))

  // A summary written in the background replaces the shown one, unless the editor is changing it.
  useEffect(() => {
    if (!summaryEdited) setFields((current) => ({ ...current, summary: issue.summary }))
  }, [issue.summary, summaryEdited])

  // While a summary is being generated, re-read the issue every few seconds (for up to six minutes).
  const pending = issue.summaryStatus === 'pending'
  useEffect(() => {
    if (!pending) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > 360_000) window.clearInterval(timer)
      else router.refresh()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [pending, router])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function checkFiles() {
    // Read after the dropzone has updated its input (it also clears it with "Remove file").
    window.setTimeout(() => {
      const form = formRef.current
      if (!form) return
      const data = new FormData(form)
      setFilesChosen(['pdf', 'cover'].some((name) => { const file = data.get(name); return file instanceof File && file.size > 0 }))
    }, 0)
  }

  function discard() {
    setFields(fieldsOf(issue))
    setSummaryEdited(false)
    setRemoveCover(false)
    setFilesChosen(false)
    setFileKey((key) => key + 1)
    setMessage(null)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const data = new FormData(event.currentTarget)
    const pdfEntry = data.get('pdf')
    const coverEntry = data.get('cover')
    const pdf = pdfEntry instanceof File && pdfEntry.size ? pdfEntry : null
    const cover = coverEntry instanceof File && coverEntry.size ? coverEntry : null

    if (!fields.title.trim()) return setMessage({ tone: 'error', text: 'The issue needs a title.' })
    if (pdf && (pdf.type !== 'application/pdf' || pdf.size > 400 * 1024 * 1024)) return setMessage({ tone: 'error', text: 'Choose a PDF that is 400 MB or smaller.' })
    if (cover && (!['image/jpeg', 'image/png', 'image/webp'].includes(cover.type) || cover.size > 8 * 1024 * 1024)) return setMessage({ tone: 'error', text: 'The cover must be JPG, PNG or WebP and 8 MB or smaller.' })
    if (!pdf && !issue.fileUrl && !fields.articleText.trim()) return setMessage({ tone: 'error', text: 'An issue needs a PDF or article text.' })

    setBusy(true)
    setMessage(null)
    const uploaded: string[] = []
    let saved = false
    let prepared: Promise<{ pageImages: PageImage[] } | null> | null = null
    const safeName = (file: File) => file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    const notes: string[] = []
    try {
      const input: Parameters<typeof editMagazineIssue>[1] = {}
      for (const key of changed) {
        if (key === 'summary') continue
        ;(input as Record<string, unknown>)[key] = fields[key]
      }
      if (summaryEdited && fields.summary !== issue.summary) input.summary = fields.summary

      const totalBytes = (pdf?.size ?? 0) + (cover?.size ?? 0)
      const loadedBytes = { pdf: 0, cover: 0 }
      // The bar covers the files' bytes and, for a new PDF, its reader pages (half each), so it
      // does not reach 100% while pages are still uploading.
      const pages = { done: 0, total: 0 }
      const percent = () => {
        const files = totalBytes ? (loadedBytes.pdf + loadedBytes.cover) / totalBytes : 1
        const done = pdf ? (files + (pages.total ? pages.done / pages.total : 0)) / 2 : files
        return Math.min(99, Math.floor(done * 100))
      }
      const report = (asset: keyof typeof loadedBytes, loaded: number) => {
        loadedBytes[asset] = Math.max(loadedBytes[asset], loaded)
        setProgress((current) => ({ stage: current?.stage ?? 'Uploading files…', detail: current?.detail ?? '', percent: percent() }))
      }

      // A new PDF is prepared for readers in the browser (page images and text) while it uploads.
      let prepareError = ''
      const preparing = pdf
        ? pdf.arrayBuffer()
          .then(async (buffer) => (await import('@/lib/pdf-text')).preparePdfForReaders({ data: buffer }, {
            issueId: issue.id,
            userId,
            title: fields.title,
            onProgress: (detail) => setProgress((current) => ({ stage: current?.stage ?? 'Uploading files…', percent: percent(), detail })),
            onPagesDone: (done, total) => {
              pages.done = done
              pages.total = total
              setProgress((current) => ({ stage: current?.stage ?? 'Uploading files…', detail: current?.detail ?? '', percent: percent() }))
            },
          }))
          .catch((error: unknown) => {
            console.error('Preparing the PDF for readers failed:', error)
            prepareError = error instanceof Error ? error.message : 'unknown error'
            return null
          })
        : null
      prepared = preparing

      if (totalBytes) setProgress({ stage: 'Uploading files…', percent: 0, detail: '' })
      if (cover) {
        const key = await uploadToStorage(cover, { issueId: issue.id, assetType: 'cover', filename: `cover-${safeName(cover)}`, onProgress: (loaded) => report('cover', loaded) })
        uploaded.push(key)
        input.coverUrl = key
      } else if (removeCover && issue.coverUrl) {
        input.coverUrl = null
      }

      if (pdf) {
        const fileUrl = await uploadToStorage(pdf, { issueId: issue.id, assetType: 'issue', filename: `issue-${safeName(pdf)}`, onProgress: (loaded) => report('pdf', loaded) })
        uploaded.push(fileUrl)
        setProgress((current) => ({ stage: 'Uploading reader pages…', percent: percent(), detail: current?.detail ?? '' }))
        const result = await preparing
        let pageImages: PageImage[] = []
        if (result) {
          pageImages = result.pageImages
          notes.push(`Prepared ${pageImages.length} reader pages from the new PDF.`)
          // Use the new PDF's text, unless the editor changed the article text in this form.
          const text = result.text
          if (input.articleText === undefined && text.text && text.text.length <= MAX_ARTICLE_CHARS) {
            input.articleText = text.text
          } else if (input.articleText === undefined && !text.text) {
            notes.push('No readable text was found in it, so the AI summary is written from the PDF itself.')
          }
        } else {
          notes.push(`The reader pages could not be prepared (${prepareError}), so the magazine view loads the PDF directly. Use “Prepare for readers” in the dashboard to retry.`)
        }
        input.pdf = { fileUrl, fileName: pdf.name, fileSize: pdf.size, pageImages }
        if (input.summary === undefined) notes.push('A new summary is being generated from it.')
      }

      if (!Object.keys(input).length) {
        setMessage({ tone: 'ok', text: 'Nothing to save: no changes were made.' })
        return
      }
      setProgress({ stage: 'Saving changes…', percent: null, detail: '' })
      await editMagazineIssue(issue.id, input)
      saved = true
      // Close the editor: back to the issue list, which confirms the save and shows these notes.
      try { window.sessionStorage.setItem(`issue-saved-note:${issue.id}`, notes.join(' ')) } catch { /* Storage blocked: the list still confirms the save. */ }
      setProgress({ stage: 'Saved. Returning to your issues…', percent: null, detail: '' })
      setFilesChosen(false)
      setRemoveCover(false)
      setFields(fieldsOf(issue))
      router.push(`/admin?panel=issues&saved=${encodeURIComponent(issue.id)}`)
      return
    } catch (error) {
      console.error('Saving the issue failed:', error)
      setMessage({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'The changes could not be saved. Please try again.' })
    } finally {
      // Files uploaded for a save that failed are not used by the issue; remove them, including
      // reader pages that were still being prepared when the save stopped.
      if (!saved) {
        const pages = prepared ? (await prepared)?.pageImages.map((page) => page.path) ?? [] : []
        const unused = [...uploaded, ...pages]
        if (unused.length) await discardPageUploads(issue.id, unused).catch((error: unknown) => console.error('Could not remove unused uploads:', error))
        setProgress(null)
        setBusy(false)
      }
    }
  }

  async function regenerate() {
    if (summaryEdited && !window.confirm('Regenerating replaces your unsaved summary edits with a new AI summary. Continue?')) return
    setBusy(true)
    try {
      await regenerateIssueSummary(issue.id)
      setSummaryEdited(false)
      setMessage({ tone: 'ok', text: 'Generating a new summary. It will appear here when it is ready.' })
      router.refresh()
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'The summary could not be regenerated.' })
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${issue.title}” and all of its uploaded files? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteMagazineIssue(issue.id)
      router.push('/admin?panel=issues')
    } catch {
      setMessage({ tone: 'error', text: 'The issue could not be deleted. Please try again.' })
      setBusy(false)
    }
  }

  const coverSrc = issue.coverUrl ? `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=cover&v=${encodeURIComponent(issue.coverUrl.split('/').pop() ?? '')}` : null
  const pdfHref = issue.fileUrl ? `/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=issue` : null

  return <main className="admin-shell">
    <header className="container admin-topbar">
      <Link href="/" className="wordmark"><span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><span className="wordmark-tagline">EDITORIAL CONTROL ROOM</span></Link>
      <Link className="text-link" href="/admin?panel=issues"><ArrowLeft aria-hidden="true" /> Your issues</Link>
    </header>
    <form ref={formRef} className="container admin-content edit-issue" onSubmit={save} onChange={checkFiles}>
      <div className="edit-issue-heading">
        <div>
          <span className="eyebrow">Edit magazine</span>
          <h1 className="editorial">{issue.title}</h1>
          <div className="edit-issue-status">
            <span className={issue.published ? 'status-pill published' : 'status-pill'}>{issue.published ? 'Published' : 'Draft'}</span>
            {issue.featured && <span className="status-pill featured">Featured</span>}
            <small>Last saved <SavedAt iso={issue.updatedAt} /></small>
          </div>
        </div>
        <div className="edit-issue-links">
          {issue.published && <Link className="text-link" href={`/read/${encodeURIComponent(issue.id)}`} target="_blank">View on site <ExternalLink aria-hidden="true" /></Link>}
          {pdfHref && <a className="text-link" href={pdfHref} target="_blank" rel="noreferrer">Preview PDF <ExternalLink aria-hidden="true" /></a>}
        </div>
      </div>

      <div className="edit-issue-grid">
        <div className="edit-issue-main">
          <section className="edit-issue-card">
            <h2 className="editorial">Details</h2>
            <div className="upload-fields">
              <label className="admin-field wide">Issue title<input value={fields.title} onChange={(event) => set('title', event.target.value)} required maxLength={180} /></label>
              <label className="admin-field">Issue date<input type="date" value={fields.issueDate} onChange={(event) => set('issueDate', event.target.value)} /></label>
              <label className="admin-field">Industry<input value={fields.industry} onChange={(event) => set('industry', event.target.value)} maxLength={80} placeholder="Leadership, healthcare…" /></label>
              <label className="admin-field wide">Region<input value={fields.region} onChange={(event) => set('region', event.target.value)} maxLength={80} placeholder="Global, America…" /></label>
              <label className="admin-field wide">Description<textarea value={fields.description} onChange={(event) => set('description', event.target.value)} rows={3} maxLength={2000} placeholder="Short issue description, shown under the title" /></label>
            </div>
          </section>

          <section className="edit-issue-card">
            <div className="edit-issue-card-heading">
              <h2 className="editorial">The issue in brief</h2>
              {(issue.fileUrl || issue.articleText.trim()) && <button className="secondary-button" type="button" disabled={busy || pending} onClick={() => void regenerate()}>{pending ? 'Generating…' : issue.summary ? 'Regenerate with AI' : 'Generate with AI'}</button>}
            </div>
            <p className="edit-issue-note">{summarySource(issue)}</p>
            <label className="admin-field">Summary
              <textarea className="edit-issue-summary" value={fields.summary} onChange={(event) => { setSummaryEdited(true); set('summary', event.target.value) }} rows={14} maxLength={20_000} placeholder="Opening paragraph, then sections. Put each section heading on its own line starting with “## ”, and leave a blank line between paragraphs." />
              <small>Plain paragraphs separated by blank lines; lines starting with “## ” become section headings.</small>
            </label>
            {fields.summary.trim() && <details className="edit-issue-preview">
              <summary>Preview as readers see it</summary>
              <div className="summary-preview"><SummaryArticle summary={fields.summary} headingLevel={3} /></div>
            </details>}
          </section>

          <section className="edit-issue-card">
            <h2 className="editorial">Article text</h2>
            <p className="edit-issue-note">The full text behind “Read the full text from the issue”. Uploading a new PDF replaces it with the new PDF’s text, unless you change it here too.</p>
            <label className="admin-field">Article text
              <textarea className="edit-issue-article" value={fields.articleText} onChange={(event) => set('articleText', event.target.value)} rows={16} maxLength={MAX_ARTICLE_CHARS} placeholder="Use a blank line between paragraphs; lines starting with # become section headings." />
              <small>{fields.articleText.length.toLocaleString('en-US')} / {MAX_ARTICLE_CHARS.toLocaleString('en-US')} characters</small>
            </label>
          </section>
        </div>

        <aside className="edit-issue-side">
          <section className="edit-issue-card">
            <h2 className="editorial">Visibility</h2>
            <label className="edit-issue-toggle"><input type="checkbox" checked={fields.published} onChange={(event) => set('published', event.target.checked)} /><span><strong>Published</strong><small>Readers can find and open this issue.</small></span></label>
            <label className="edit-issue-toggle"><input type="checkbox" checked={fields.featured} onChange={(event) => set('featured', event.target.checked)} /><span><strong>Featured</strong><small>Shown first on the site. Only one issue can be featured.</small></span></label>
          </section>

          <section className="edit-issue-card">
            <h2 className="editorial">Cover image</h2>
            {coverSrc && !removeCover
              ? <img className="edit-issue-cover" src={coverSrc} alt={`Current cover of ${issue.title}`} />
              : <p className="edit-issue-note">{removeCover ? 'The cover will be removed when you save; the site shows its default artwork.' : 'No cover yet; the site shows its default artwork.'}</p>}
            <FileDropzone key={`cover-${fileKey}`} name="cover" label={issue.coverUrl ? 'Replace cover' : 'Add a cover'} accept="image/jpeg,image/png,image/webp" hint="JPG, PNG or WebP up to 8 MB" icon={<ImageIcon />} />
            {issue.coverUrl && <label className="edit-issue-toggle small"><input type="checkbox" checked={removeCover} onChange={(event) => setRemoveCover(event.target.checked)} /><span><small>Remove the current cover</small></span></label>}
          </section>

          <section className="edit-issue-card">
            <h2 className="editorial">Magazine PDF</h2>
            {issue.fileUrl
              ? <p className="edit-issue-file"><FileText aria-hidden="true" /><span><strong>{issue.fileName || 'Magazine PDF'}</strong><small>{formatSize(issue.fileSize)} · {issue.pageCount ? `${issue.pageCount} reader pages` : 'reader pages not prepared'}</small></span></p>
              : <p className="edit-issue-note">No PDF yet. This issue uses its article text only.</p>}
            <FileDropzone key={`pdf-${fileKey}`} name="pdf" label={issue.fileUrl ? 'Replace PDF' : 'Add a PDF'} accept="application/pdf,.pdf" hint="PDF up to 400 MB" icon={<FileText />} />
            <small className="edit-issue-hint">A new PDF replaces the old file and its reader pages, and a new summary is written from it.</small>
          </section>

          <section className="edit-issue-card danger">
            <h2 className="editorial">Delete issue</h2>
            <p className="edit-issue-note">Removes the issue and its PDF, cover and reader pages. This cannot be undone.</p>
            <button className="text-danger" type="button" disabled={busy} onClick={() => void remove()}>Delete this issue</button>
          </section>
        </aside>
      </div>

      <div className="edit-issue-bar" role="region" aria-label="Save changes">
        <div className="edit-issue-bar-status">
          {progress
            ? <div className="upload-progress" role="status">
              <div className="upload-progress-label"><span>{progress.stage}</span>{progress.percent !== null && <strong>{progress.percent}%</strong>}</div>
              {progress.percent !== null ? <progress max="100" value={progress.percent} aria-label="Upload progress" /> : <progress aria-label="Saving" />}
              {progress.detail && <small className="upload-parse-status">{progress.detail}</small>}
            </div>
            : message
              ? <p className={message.tone === 'error' ? 'form-message is-error' : 'form-message'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>
              : <p className="form-message">{dirty ? 'You have unsaved changes.' : 'All changes saved.'}</p>}
        </div>
        <div className="edit-issue-bar-actions">
          <button className="secondary-button" type="button" disabled={busy || !dirty} onClick={discard}>Discard changes</button>
          <button className="primary-button" type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </form>
  </main>
}
