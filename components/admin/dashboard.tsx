'use client'

import { type FormEvent, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { upload } from '@vercel/blob/client'
import { authClient } from '@/lib/auth-client'
import { createMagazineIssue, deleteMagazineIssue, savePageContent, updateContact, updateMagazineIssue } from '@/lib/actions/admin'

type Contact = { id: string; name: string; email: string; company: string; source: string; sourcePage: string; referrerHost: string; status: string; notes: string; emailConsent: boolean; createdAt: string }
type Issue = { id: string; title: string; description: string; industry: string; region: string; issueDate: string; coverUrl: string | null; fileUrl: string; fileName: string; fileSize: number; published: boolean; featured: boolean; createdAt: string }
type PageRecord = { slug: string; title: string; content: Record<string, string>; published: boolean }
type Analytics = { views: number; visitors: number; sessions: number; topSources: Array<{ source: string; medium: string; campaign: string; referrer: string; views: number }>; topPages: Array<{ path: string; views: number }>; devices: Array<{ device: string; views: number }>; recentEvents: Array<{ eventType: string; path: string; source: string; referrer: string; createdAt: string }> }
type DashboardProps = { userId: string; email: string; contacts: Contact[]; issues: Issue[]; pages: PageRecord[]; analytics: Analytics }
type Panel = 'overview' | 'contacts' | 'magazines' | 'pages' | 'analytics'

const panels: Array<{ id: Panel; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'magazines', label: 'Magazines' },
  { id: 'pages', label: 'Page editor' },
  { id: 'analytics', label: 'Analytics' },
]

export function AdminDashboard({ userId, email, contacts, issues, pages, analytics }: DashboardProps) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>('overview')
  const [notice, setNotice] = useState('')
  const [pending, startTransition] = useTransition()

  function runAction(action: () => Promise<unknown>, success: string) {
    startTransition(async () => {
      try {
        await action()
        setNotice(success)
        router.refresh()
      } catch {
        setNotice('That change could not be saved. Please try again.')
      }
    })
  }

  async function signOut() {
    await authClient.signOut()
    window.location.assign('/sign-in')
  }

  return (
    <main className="admin-shell">
      <header className="container admin-topbar">
        <Link href="/" className="wordmark"><span className="wordmark-title"><span className="wordmark-the">The</span> Visionary Voice</span><span className="wordmark-tagline">EDITORIAL CONTROL ROOM</span></Link>
        <div className="admin-account"><span>{email}</span><button className="secondary-button" onClick={signOut}>Sign out</button></div>
      </header>
      <div className="container admin-content">
        <div className="admin-intro"><div><span className="eyebrow">Administrator workspace</span><h1 className="editorial">Your publication, in view.</h1><p>Manage magazine issues, page copy, inquiries and consented audience analytics.</p></div><Link className="text-link" href="/">View website <span aria-hidden="true">↗</span></Link></div>
        <nav className="admin-tabs" aria-label="Admin sections">
          {panels.map((item) => <button key={item.id} className={panel === item.id ? 'admin-tab active' : 'admin-tab'} onClick={() => setPanel(item.id)} aria-current={panel === item.id ? 'page' : undefined}>{item.label}</button>)}
        </nav>
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {panel === 'overview' && <Overview contacts={contacts} issues={issues} analytics={analytics} onNavigate={setPanel} />}
        {panel === 'contacts' && <ContactsPanel contacts={contacts} pending={pending} runAction={runAction} />}
        {panel === 'magazines' && <MagazinesPanel issues={issues} userId={userId} runAction={runAction} />}
        {panel === 'pages' && <PagesPanel pages={pages} pending={pending} runAction={runAction} />}
        {panel === 'analytics' && <AnalyticsPanel analytics={analytics} />}
      </div>
    </main>
  )
}

function sourceLabel(source: { source: string; medium: string; campaign: string; referrer: string }) {
  const campaign = [source.source, source.medium, source.campaign].filter(Boolean).join(' / ')
  return campaign || source.referrer || 'Direct / unknown'
}

function Overview({ contacts, issues, analytics, onNavigate }: { contacts: Contact[]; issues: Issue[]; analytics: Analytics; onNavigate: (panel: Panel) => void }) {
  const newLeads = contacts.filter((contact) => contact.status === 'new').length
  return <section className="admin-panel">
    <div className="admin-panel-heading"><div><span className="eyebrow">Last 30 days</span><h2 className="editorial">A quick read on your publication</h2></div><p>Only visitors who opted into analytics are included.</p></div>
    <div className="stat-grid">
      <Stat label="Page views" value={analytics.views.toLocaleString()} hint="Consent-based visits" />
      <Stat label="Unique visitors" value={analytics.visitors.toLocaleString()} hint="Pseudonymous sessions" />
      <Stat label="Contacts" value={contacts.length.toLocaleString()} hint={`${newLeads} new inquiries`} />
      <Stat label="Published issues" value={issues.filter((issue) => issue.published).length.toLocaleString()} hint="In the public archive" />
    </div>
    <div className="admin-overview-grid">
      <section><div className="admin-subheading"><h3 className="editorial">Top sources</h3><button className="text-link" onClick={() => onNavigate('analytics')}>Full analytics <span aria-hidden="true">↗</span></button></div>{analytics.topSources.length ? analytics.topSources.slice(0, 4).map((source, index) => <div className="analytics-row" key={`${source.source}-${source.referrer}-${index}`}><span>{sourceLabel(source)}</span><strong>{source.views} views</strong></div>) : <p className="empty-copy">No opted-in visits yet. Accept analytics on the public site to begin.</p>}</section>
      <section><div className="admin-subheading"><h3 className="editorial">Recently added contacts</h3><button className="text-link" onClick={() => onNavigate('contacts')}>Open CRM <span aria-hidden="true">↗</span></button></div>{contacts.slice(0, 4).length ? contacts.slice(0, 4).map((contact) => <div className="analytics-row" key={contact.id}><span>{contact.name}</span><strong>{contact.status}</strong></div>) : <p className="empty-copy">Website inquiries will appear here.</p>}</section>
    </div>
  </section>
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <article className="admin-stat"><span>{label}</span><strong>{value}</strong><small>{hint}</small></article>
}

function ContactsPanel({ contacts, pending, runAction }: { contacts: Contact[]; pending: boolean; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => contacts.filter((contact) => `${contact.name} ${contact.email} ${contact.company} ${contact.source}`.toLowerCase().includes(search.trim().toLowerCase())), [contacts, search])
  const [statusFilter, setStatusFilter] = useState('all')
  const visibleContacts = filtered.filter((contact) => statusFilter === 'all' || contact.status === statusFilter)

  function exportContacts() {
    const columns = ['Name', 'Email', 'Company', 'Source', 'Status', 'Notes', 'Source page', 'Referrer', 'Created at', 'Email consent']
    const safeCell = (value: unknown) => {
      let text = String(value ?? '')
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`
      return `"${text.replace(/"/g, '""')}"`
    }
    const rows = contacts.map((contact) => [
      contact.name, contact.email, contact.company, contact.source, contact.status,
      contact.notes, contact.sourcePage, contact.referrerHost, contact.createdAt,
      contact.emailConsent ? 'Yes' : 'No',
    ])
    const csv = [columns, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `visionary-voice-contacts-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">Customer relationship management</span><h2 className="editorial">Website contacts</h2></div><div className="crm-toolbar"><label className="admin-search">Search contacts<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or company" /></label><label className="admin-field compact">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="archived">Archived</option></select></label><button className="secondary-button" type="button" onClick={exportContacts} disabled={!contacts.length}>Export CSV</button></div></div>
    <p className="crm-result-count">Showing {visibleContacts.length} of {contacts.length} contacts</p>
    {visibleContacts.length ? <div className="contact-list">{visibleContacts.map((contact) => <ContactCard key={contact.id} contact={contact} pending={pending} runAction={runAction} />)}</div> : <EmptyState title="No contacts found" body="Try another search or status. Newsletter sign-ups with email consent will appear here." />}
  </section>
}

function ContactCard({ contact, pending, runAction }: { contact: Contact; pending: boolean; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  const [status, setStatus] = useState(contact.status)
  const [notes, setNotes] = useState(contact.notes)
  return <article className="contact-card"><div className="contact-main"><div><h3>{contact.name}</h3><a href={`mailto:${contact.email}`}>{contact.email}</a><p>{contact.company || 'Independent'} · {contact.source} · {contact.sourcePage}</p><small>{contact.referrerHost || 'Direct visit'} · {new Date(contact.createdAt).toLocaleDateString()}</small></div><label className="admin-field compact">Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="archived">Archived</option></select></label></div><label className="admin-field">CRM notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} maxLength={3000} placeholder="Add a private follow-up note" /></label><div className="contact-card-footer"><span>{contact.emailConsent ? 'Email consent recorded' : 'No marketing consent'}</span><button className="secondary-button" disabled={pending} onClick={() => runAction(() => updateContact(contact.id, { status, notes }), 'Contact updated.')}>Save contact</button></div></article>
}

function MagazinesPanel({ issues, userId, runAction }: { issues: Issue[]; userId: string; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">Publication library</span><h2 className="editorial">Upload and manage issues</h2></div><p>PDF issues are limited to 400 MB; cover images to 8 MB.</p></div><UploadIssueForm userId={userId} runAction={runAction} />
    <div className="admin-subheading issue-list-heading"><h3 className="editorial">Your issues <span>{issues.length}</span></h3><p>Draft issues stay private until published.</p></div>
    {issues.length ? <div className="managed-issues">{issues.map((issue) => <IssueManager key={issue.id} issue={issue} runAction={runAction} />)}</div> : <EmptyState title="No uploaded magazines yet" body="Upload a PDF and optional cover image to add the first issue." />}
  </section>
}

function UploadIssueForm({ userId, runAction }: { userId: string; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const form = event.currentTarget
    const data = new FormData(form)
    const pdf = data.get('pdf')
    const cover = data.get('cover')
    if (!(pdf instanceof File) || !pdf.size || pdf.type !== 'application/pdf' || pdf.size > 400 * 1024 * 1024) {
      setMessage('Choose a PDF issue that is 400 MB or smaller.')
      setBusy(false)
      return
    }
    if (cover instanceof File && cover.size && (!['image/jpeg', 'image/png', 'image/webp'].includes(cover.type) || cover.size > 8 * 1024 * 1024)) {
      setMessage('Cover must be JPG, PNG or WebP and 8 MB or smaller.')
      setBusy(false)
      return
    }

    const id = crypto.randomUUID()
    const safeName = (file: File) => file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    try {
      let coverUrl = ''
      if (cover instanceof File && cover.size) {
        const coverBlob = await upload(`magazines/${userId}/${id}/cover-${safeName(cover)}`, cover, {
          access: 'private', handleUploadUrl: '/api/blob/upload-token',
          clientPayload: JSON.stringify({ issueId: id, assetType: 'cover' }),
        })
        coverUrl = coverBlob.pathname
      }
      const issueBlob = await upload(`magazines/${userId}/${id}/issue-${safeName(pdf)}`, pdf, {
        access: 'private', handleUploadUrl: '/api/blob/upload-token',
        clientPayload: JSON.stringify({ issueId: id, assetType: 'issue' }),
      })
      await createMagazineIssue({
        id,
        title: String(data.get('title') ?? '').trim(),
        description: String(data.get('description') ?? '').trim(),
        industry: String(data.get('industry') ?? '').trim(),
        region: String(data.get('region') ?? '').trim(),
        issueDate: String(data.get('issueDate') ?? ''),
        fileUrl: issueBlob.pathname,
        coverUrl,
        fileName: pdf.name,
        fileSize: pdf.size,
      })
      form.reset()
      setMessage('Issue uploaded as a draft. Publish it when it is ready for readers.')
      runAction(async () => undefined, 'Magazine library refreshed.')
    } catch (error) {
  console.error('Magazine upload error:', error)

  setMessage(
    error instanceof Error
      ? error.message
      : 'Upload could not be completed.'
  )
} finally {
      setBusy(false)
    }
  }

  return <form className="upload-form" onSubmit={submit}>
    <div className="upload-form-heading"><div><h3 className="editorial">Add a new magazine</h3><p>Upload artwork and publication details; the issue begins as a draft.</p></div></div>
    <div className="upload-fields">
      <label className="admin-field">Issue title<input name="title" required maxLength={180} placeholder="e.g. Women Who Inspire the Industry, 2026" /></label>
      <label className="admin-field">Issue date<input name="issueDate" type="date" /></label>
      <label className="admin-field">Industry<input name="industry" maxLength={80} placeholder="Leadership, healthcare…" /></label>
      <label className="admin-field">Region<input name="region" maxLength={80} placeholder="Global, America…" /></label>
      <label className="admin-field wide">Description<textarea name="description" rows={3} maxLength={2000} placeholder="Short issue description" /></label>
      <label className="admin-field">Magazine PDF<input name="pdf" type="file" accept="application/pdf,.pdf" required /></label>
      <label className="admin-field">Cover image (optional)<input name="cover" type="file" accept="image/jpeg,image/png,image/webp" /></label>
    </div>
    {message && <p className="form-message" role="status">{message}</p>}
    <button className="primary-button" disabled={busy}>{busy ? 'Uploading…' : 'Upload magazine'}</button>
  </form>
}

function IssueManager({ issue, runAction }: { issue: Issue; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  return <article className="managed-issue"><div className="managed-issue-copy"><div><h4 className="editorial">{issue.title}</h4><p>{issue.industry || 'Business'} · {issue.region || 'Global'} · {issue.issueDate || new Date(issue.createdAt).toLocaleDateString()}</p><span className={issue.published ? 'status-pill published' : 'status-pill'}>{issue.published ? 'Published' : 'Draft'}</span>{issue.featured && <span className="status-pill featured">Featured</span>}</div><div className="managed-issue-actions"><a className="text-link" href={`/api/magazine-assets?id=${encodeURIComponent(issue.id)}&asset=issue`} target="_blank" rel="noreferrer">Preview PDF <span aria-hidden="true">↗</span></a><button className="secondary-button" onClick={() => runAction(() => updateMagazineIssue(issue.id, { published: !issue.published }), issue.published ? 'Issue unpublished.' : 'Issue published.')}>{issue.published ? 'Unpublish' : 'Publish'}</button><button className="secondary-button" onClick={() => runAction(() => updateMagazineIssue(issue.id, { featured: !issue.featured }), issue.featured ? 'Featured issue cleared.' : 'Issue set as featured.')}>{issue.featured ? 'Remove featured' : 'Feature issue'}</button><button className="text-danger" onClick={() => { if (window.confirm('Delete this issue and its uploaded files?')) runAction(() => deleteMagazineIssue(issue.id), 'Issue deleted.') }}>Delete</button></div></div></article>
}

function PagesPanel({ pages, pending, runAction }: { pages: PageRecord[]; pending: boolean; runAction: (action: () => Promise<unknown>, success: string) => void }) {
  const [slug, setSlug] = useState(pages[0]?.slug ?? 'home')
  const page = pages.find((item) => item.slug === slug) ?? pages[0]
  const [content, setContent] = useState<Record<string, string>>(page?.content ?? {})
  const [title, setTitle] = useState(page?.title ?? '')
  const [published, setPublished] = useState(page?.published ?? false)

  function choosePage(nextSlug: string) {
    const nextPage = pages.find((item) => item.slug === nextSlug)
    if (!nextPage) return
    setSlug(nextSlug)
    setTitle(nextPage.title)
    setContent(nextPage.content)
    setPublished(nextPage.published)
  }

  if (!page) return <EmptyState title="No editable pages" body="Page defaults could not be loaded." />
  return <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">Content management</span><h2 className="editorial">Edit your pages</h2></div><p>Changes publish to the public site when you choose Publish.</p></div>
    <div className="page-editor-toolbar"><label className="admin-field compact">Page<select value={slug} onChange={(event) => choosePage(event.target.value)}>{pages.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}</select></label><span className={published ? 'status-pill published' : 'status-pill'}>{published ? 'Published' : 'Draft'}</span></div>
    <div className="page-editor-fields"><label className="admin-field">Page label<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label>{Object.entries(content).map(([key, value]) => <label className="admin-field wide" key={key}>{fieldLabel(key)}<textarea rows={key.toLowerCase().includes('description') || key.toLowerCase().includes('intro') ? 4 : 2} value={value} onChange={(event) => setContent((current) => ({ ...current, [key]: event.target.value }))} maxLength={4000} /></label>)}</div>
    <div className="page-editor-actions"><button className="secondary-button" disabled={pending} onClick={() => { setPublished(false); runAction(() => savePageContent({ slug, title, content, published: false }), 'Draft saved.') }}>Save draft</button><button className="primary-button" disabled={pending} onClick={() => { setPublished(true); runAction(() => savePageContent({ slug, title, content, published: true }), 'Page published.') }}>Publish page</button></div>
  </section>
}

function fieldLabel(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

function AnalyticsPanel({ analytics }: { analytics: Analytics }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><span className="eyebrow">Consent-based analytics · 30 days</span><h2 className="editorial">Who is finding the magazine?</h2></div><p>Visitors are counted only after opt-in. No raw IP address, full URL query, or raw browser fingerprint is stored.</p></div>
    <div className="stat-grid"><Stat label="Page views" value={analytics.views.toLocaleString()} hint="Opted-in page views" /><Stat label="Unique visitors" value={analytics.visitors.toLocaleString()} hint="30-day pseudonymous count" /><Stat label="Top pages" value={analytics.topPages.length.toLocaleString()} hint="Pages with visits" /><Stat label="Traffic sources" value={analytics.topSources.length.toLocaleString()} hint="Referrer / campaign groups" /></div>
    <div className="admin-overview-grid"><section><h3 className="editorial">Where people came from</h3>{analytics.topSources.length ? analytics.topSources.map((item, index) => <div className="analytics-row" key={`${item.source}-${item.referrer}-${index}`}><span>{sourceLabel(item)}</span><strong>{item.views}</strong></div>) : <p className="empty-copy">No analytics data yet. Visitors must accept analytics on the website first.</p>}</section><section><h3 className="editorial">Most viewed pages</h3>{analytics.topPages.length ? analytics.topPages.map((item) => <div className="analytics-row" key={item.path}><span>{item.path}</span><strong>{item.views}</strong></div>) : <p className="empty-copy">Page views will appear here after visitors opt in.</p>}<h3 className="editorial" style={{ marginTop: 24 }}>Device groups</h3>{analytics.devices.length ? analytics.devices.map((item) => <div className="analytics-row" key={item.device}><span>{item.device}</span><strong>{item.views}</strong></div>) : <p className="empty-copy">Device groups appear after consented visits.</p>}</section></div>
    <div className="admin-subheading"><h3 className="editorial">Recent consented visits</h3></div><div className="event-list">{analytics.recentEvents.map((event, index) => <div className="analytics-row" key={`${event.createdAt}-${index}`}><span>{event.path} · {event.source || event.referrer || 'Direct'}</span><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}</div>
  </section>
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><h3 className="editorial">{title}</h3><p>{body}</p></div>
}
