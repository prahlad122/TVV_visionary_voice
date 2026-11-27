'use client'

import { type ChangeEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bold, ExternalLink, Heading2, Heading3, Image as ImageIcon, Italic, Link2, List, ListOrdered, Minus, Quote, Upload, X } from 'lucide-react'
import { BlogContent, plainText, readingMinutes } from '@/components/blog/blog-content'
import { deleteBlogPost, saveBlogPost } from '@/lib/actions/blog'
import { uploadToStorage } from '@/lib/upload'

export type EditableBlogPost = {
  id: string
  title: string
  excerpt: string
  content: string
  author: string
  category: string
  coverUrl: string | null
  slug: string
  published: boolean
  updatedAt: string | null
}

type Fields = Pick<EditableBlogPost, 'title' | 'excerpt' | 'content' | 'author' | 'category'>

const MAX_COVER_BYTES = 8 * 1024 * 1024
/** Handed to the dashboard, which shows it after the redirect back to the Blog tab. */
export const BLOG_NOTICE_KEY = 'admin-blog-notice'
/** Where the dashboard lists blog posts: "Your issues", Blog tab. */
export const BLOG_LIST_HREF = '/admin?panel=issues&tab=blog'

/**
 * The blog writing page: title, summary, cover image and the post itself, written in light
 * Markdown with a formatting toolbar and a live preview that matches the public post page.
 */
export function BlogEditor({ post, isNew, categories, onSaved }: {
  post: EditableBlogPost
  isNew: boolean
  categories: string[]
  /** Set when the editor sits inside the dashboard's Upload tab: called after a save instead of leaving the page. */
  onSaved?: (notice: string) => void
}) {
  const embedded = Boolean(onSaved)
  const router = useRouter()
  const initial: Fields = { title: post.title, excerpt: post.excerpt, content: post.content, author: post.author, category: post.category }
  const [fields, setFields] = useState<Fields>(initial)
  const [view, setView] = useState<'write' | 'preview'>('write')
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [removeCover, setRemoveCover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const editor = useRef<HTMLTextAreaElement>(null)

  const dirty = cover !== null || removeCover || (Object.keys(initial) as Array<keyof Fields>).some((key) => fields[key] !== initial[key])
  const words = useMemo(() => plainText(fields.content).split(' ').filter(Boolean).length, [fields.content])
  // Uploaded covers are served from storage; a site image (the demo posts) is used directly.
  const existingCover = !post.coverUrl || removeCover ? null
    : post.coverUrl.startsWith('/') ? post.coverUrl
      : `/api/blog-assets?id=${encodeURIComponent(post.id)}&v=${encodeURIComponent(post.coverUrl.split('/').pop() ?? '')}`
  const shownCover = coverPreview ?? existingCover

  // Warn before leaving with unsaved writing.
  useEffect(() => {
    if (!dirty || busy) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])

  useEffect(() => () => { if (coverPreview) URL.revokeObjectURL(coverPreview) }, [coverPreview])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  function chooseCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMessage({ tone: 'error', text: 'Choose a JPG, PNG or WebP image for the cover.' })
    if (file.size > MAX_COVER_BYTES) return setMessage({ tone: 'error', text: 'The cover image must be 8 MB or smaller.' })
    setCover(file)
    setCoverPreview(URL.createObjectURL(file))
    setRemoveCover(false)
    setMessage(null)
  }

  function clearCover() {
    setCover(null)
    setCoverPreview(null)
    if (post.coverUrl) setRemoveCover(true)
  }

  /** Wrap the selection in Markdown (bold, italic, link) or prefix the selected lines (headings, lists, quotes). */
  function format(kind: 'h2' | 'h3' | 'bold' | 'italic' | 'quote' | 'ul' | 'ol' | 'link' | 'hr') {
    const area = editor.current
    if (!area) return
    const { selectionStart: start, selectionEnd: end, value } = area
    const selected = value.slice(start, end)
    let before = value.slice(0, start)
    let after = value.slice(end)
    let insert = selected
    let cursorStart = start
    let cursorEnd = end

    if (kind === 'bold' || kind === 'italic') {
      const mark = kind === 'bold' ? '**' : '*'
      const text = selected || (kind === 'bold' ? 'bold text' : 'italic text')
      insert = `${mark}${text}${mark}`
      cursorStart = start + mark.length
      cursorEnd = cursorStart + text.length
    } else if (kind === 'link') {
      const text = selected || 'link text'
      insert = `[${text}](https://)`
      cursorStart = start + text.length + 3
      cursorEnd = cursorStart + 8
    } else if (kind === 'hr') {
      insert = `${before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : ''}---\n\n`
      cursorStart = cursorEnd = start + insert.length
    } else {
      // Line formats apply to every selected line, starting from the beginning of the first one.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      before = value.slice(0, lineStart)
      const block = value.slice(lineStart, end) || ''
      const lines = block.split('\n')
      const prefix = (index: number) => kind === 'h2' ? '## ' : kind === 'h3' ? '### ' : kind === 'quote' ? '> ' : kind === 'ul' ? '- ' : `${index + 1}. `
      insert = lines.map((line, index) => `${prefix(index)}${line.replace(/^(#{1,3}\s+|>\s?|[-*•]\s+|\d+[.)]\s+)/, '')}`).join('\n')
      if (!block) insert = prefix(0) + (kind === 'h2' || kind === 'h3' ? 'Heading' : '')
      cursorStart = lineStart + prefix(0).length
      cursorEnd = lineStart + insert.length
      after = value.slice(end)
    }

    const next = before + insert + after
    set('content', next)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  function onEditorKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey)) return
    const key = event.key.toLowerCase()
    if (key === 'b') { event.preventDefault(); format('bold') }
    else if (key === 'i') { event.preventDefault(); format('italic') }
    else if (key === 'k') { event.preventDefault(); format('link') }
  }

  async function save(published: boolean) {
    if (!fields.title.trim()) return setMessage({ tone: 'error', text: 'Give the post a title before saving.' })
    if (published && !fields.content.trim()) return setMessage({ tone: 'error', text: 'Write the post before publishing it.' })
    setBusy(true)
    setMessage({ tone: 'ok', text: cover ? 'Uploading the cover image…' : 'Saving…' })
    try {
      let coverUrl: string | null | undefined
      if (cover) {
        const extension = cover.type === 'image/png' ? 'png' : cover.type === 'image/webp' ? 'webp' : 'jpg'
        const base = cover.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'image'
        coverUrl = await uploadToStorage(cover, { issueId: post.id, assetType: 'blog-cover', filename: `cover-${base}.${extension}` })
      } else if (removeCover) coverUrl = null
      setMessage({ tone: 'ok', text: 'Saving…' })
      await saveBlogPost({ id: post.id, ...fields, published, ...(coverUrl !== undefined ? { coverUrl } : {}) })
      const title = fields.title.trim()
      const notice = published
        ? (post.published ? `“${title}” updated. The changes are live.` : `“${title}” is published on the blog.`)
        : (post.published ? `“${title}” unpublished and saved as a draft.` : `Draft “${title}” saved.`)
      if (onSaved) {
        onSaved(notice)
        router.refresh()
        return
      }
      try { window.sessionStorage.setItem(BLOG_NOTICE_KEY, notice) } catch { /* Storage blocked: no notice. */ }
      setMessage({ tone: 'ok', text: `${notice} Returning to your issues…` })
      router.push(BLOG_LIST_HREF)
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error && error.message ? error.message : 'The post could not be saved. Please try again.' })
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete “${post.title || 'this post'}”? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteBlogPost(post.id)
      try { window.sessionStorage.setItem(BLOG_NOTICE_KEY, `“${post.title}” deleted.`) } catch { /* ignore */ }
      router.push(BLOG_LIST_HREF)
    } catch {
      setMessage({ tone: 'error', text: 'The post could not be deleted. Please try again.' })
      setBusy(false)
    }
  }

  const tools: Array<{ kind: Parameters<typeof format>[0]; label: string; icon: ReactNode }> = [
    { kind: 'h2', label: 'Section heading', icon: <Heading2 /> },
    { kind: 'h3', label: 'Smaller heading', icon: <Heading3 /> },
    { kind: 'bold', label: 'Bold (Ctrl+B)', icon: <Bold /> },
    { kind: 'italic', label: 'Italic (Ctrl+I)', icon: <Italic /> },
    { kind: 'link', label: 'Link (Ctrl+K)', icon: <Link2 /> },
    { kind: 'quote', label: 'Quote', icon: <Quote /> },
    { kind: 'ul', label: 'Bulleted list', icon: <List /> },
    { kind: 'ol', label: 'Numbered list', icon: <ListOrdered /> },
    { kind: 'hr', label: 'Divider', icon: <Minus /> },
  ]

  const form = <form className={embedded ? 'edit-issue blog-editor is-embedded' : 'container admin-content edit-issue blog-editor'} onSubmit={(event) => { event.preventDefault(); void save(post.published) }}>
      {!embedded && <div className="edit-issue-heading">
        <div>
          <span className="eyebrow">{isNew ? 'New blog post' : 'Edit blog post'}</span>
          <h1 className="editorial">{fields.title.trim() || 'Untitled post'}</h1>
          <div className="edit-issue-status">
            <span className={post.published ? 'status-pill published' : 'status-pill'}>{isNew ? 'Not saved yet' : post.published ? 'Published' : 'Draft'}</span>
            <small>{words.toLocaleString()} words · {readingMinutes(fields.content)} min read</small>
          </div>
        </div>
        {post.published && <div className="edit-issue-links"><Link className="text-link" href={`/blog/${post.slug}`} target="_blank">View on site <ExternalLink aria-hidden="true" /></Link></div>}
      </div>}

      <div className="edit-issue-grid">
        <div className="edit-issue-main">
          <section className="edit-issue-card">
            <label className="admin-field blog-title-field">Title<input value={fields.title} onChange={(event) => set('title', event.target.value)} maxLength={160} placeholder="A headline readers will want to open" autoFocus={isNew && !embedded} /></label>
            <label className="admin-field">Summary<textarea value={fields.excerpt} onChange={(event) => set('excerpt', event.target.value)} rows={2} maxLength={400} placeholder="One or two sentences shown under the title and on the blog page. Left empty, the post's opening lines are used." /></label>
          </section>

          <section className="edit-issue-card blog-writer">
            <div className="blog-writer-head">
              <div className="blog-view-tabs" role="tablist" aria-label="Editor view">
                <button type="button" role="tab" aria-selected={view === 'write'} className={view === 'write' ? 'is-active' : ''} onClick={() => setView('write')}>Write</button>
                <button type="button" role="tab" aria-selected={view === 'preview'} className={view === 'preview' ? 'is-active' : ''} onClick={() => setView('preview')}>Preview</button>
              </div>
              {view === 'write' && <div className="blog-toolbar" role="toolbar" aria-label="Formatting">
                {tools.map((tool) => <button key={tool.kind} type="button" title={tool.label} aria-label={tool.label} onClick={() => format(tool.kind)}>{tool.icon}</button>)}
              </div>}
            </div>
            {view === 'write'
              ? <>
                <textarea ref={editor} className="blog-textarea" value={fields.content} onChange={(event) => set('content', event.target.value)} onKeyDown={onEditorKey} rows={22} maxLength={200_000} aria-label="Post" placeholder={'Start writing…\n\nLeave a blank line between paragraphs. Use the toolbar for headings, bold, links, quotes and lists.'} />
                <p className="edit-issue-hint">Formatting: <code>## Heading</code> · <code>**bold**</code> · <code>*italic*</code> · <code>[link](https://…)</code> · <code>&gt; quote</code> · <code>- list</code></p>
              </>
              : <div className="blog-preview">
                {fields.title.trim() && <h1 className="editorial">{fields.title}</h1>}
                {fields.excerpt.trim() && <p className="article-deck">{fields.excerpt}</p>}
                {fields.author.trim() && <p className="blog-author">By {fields.author}</p>}
                {shownCover && <img className="blog-preview-cover" src={shownCover} alt="" />}
                <div className="article-body blog-body">{fields.content.trim() ? <BlogContent content={fields.content} /> : <p className="edit-issue-note">Nothing written yet.</p>}</div>
              </div>}
          </section>
        </div>

        <aside className="edit-issue-side">
          <section className="edit-issue-card">
            <h2 className="editorial">Post details</h2>
            <label className="admin-field">Author<input value={fields.author} onChange={(event) => set('author', event.target.value)} maxLength={120} placeholder="Shown as “By …”" /></label>
            <label className="admin-field">Category<input value={fields.category} onChange={(event) => set('category', event.target.value)} maxLength={60} list="blog-categories" placeholder="Leadership, interviews…" /></label>
            <datalist id="blog-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
          </section>

          <section className="edit-issue-card">
            <h2 className="editorial">Cover image</h2>
            {shownCover
              ? <div className="blog-cover-preview"><img src={shownCover} alt="Cover preview" /><button type="button" className="dropzone-clear" onClick={clearCover}><X aria-hidden="true" /> Remove cover</button></div>
              : <p className="edit-issue-note">{removeCover ? 'The cover will be removed when you save.' : 'No cover yet. Posts without one show a lettered placeholder.'}</p>}
            <label className="dropzone blog-cover-drop">
              <input className="dropzone-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseCover} />
              <span className="dropzone-icon" aria-hidden="true">{shownCover ? <Upload /> : <ImageIcon />}</span>
              <span className="dropzone-text"><strong><u>{shownCover ? 'Choose a different image' : 'Click to add a cover'}</u></strong><small>JPG, PNG or WebP up to 8 MB</small></span>
            </label>
          </section>

          {!isNew && <section className="edit-issue-card danger">
            <h2 className="editorial">Delete post</h2>
            <p className="edit-issue-note">Removes the post and its cover image. This cannot be undone.</p>
            <button className="text-danger" type="button" disabled={busy} onClick={() => void remove()}>Delete this post</button>
          </section>}
        </aside>
      </div>

      <div className="edit-issue-bar" role="region" aria-label="Save the post">
        <div className="edit-issue-bar-status">
          {message
            ? <p className={message.tone === 'error' ? 'form-message is-error' : 'form-message'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>
            : <p className="form-message">{dirty ? `You have unsaved changes · ${words.toLocaleString()} words · ${readingMinutes(fields.content)} min read` : isNew ? 'Start writing, then save a draft or publish.' : 'All changes saved.'}</p>}
        </div>
        <div className="edit-issue-bar-actions">
          {post.published
            ? <>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void save(false)}>Unpublish</button>
              <button className="primary-button" type="button" disabled={busy || (!dirty && !isNew)} onClick={() => void save(true)}>{busy ? 'Saving…' : 'Update post'}</button>
            </>
            : <>
              <button className="secondary-button" type="button" disabled={busy} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Save draft'}</button>
              <button className="primary-button" type="button" disabled={busy} onClick={() => void save(true)}>Publish</button>
            </>}
        </div>
      </div>
    </form>

  if (embedded) return form
  return <main className="admin-shell">
    <header className="container admin-topbar">
      <Link href="/" className="wordmark"><span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><span className="wordmark-tagline">EDITORIAL CONTROL ROOM</span></Link>
      <Link className="text-link" href={BLOG_LIST_HREF}><ArrowLeft aria-hidden="true" /> Your blog posts</Link>
    </header>
    {form}
  </main>
}
