'use server'

import { deleteObjects } from '@/lib/storage'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { requireAdminAction } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { cmsPages, crmContacts, magazineIssues, type PageImage } from '@/lib/db/schema'
import { summarizeIssue } from '@/lib/issue-summary'

const MAX_PAGES = 2000

/** Every page image must be an upload under this admin's folder for this issue. */
function validPageImages(value: unknown, userId: string, issueId: string): PageImage[] {
  if (!Array.isArray(value) || value.length > MAX_PAGES) throw new Error('Invalid page images.')
  return value.map((item) => {
    const image = item as Partial<PageImage> | null
    if (!image || typeof image.path !== 'string' || !ownedStoragePath(image.path, userId, issueId)
      || !Number.isInteger(image.width) || !Number.isInteger(image.height)
      || image.width! < 1 || image.height! < 1 || image.width! > 10_000 || image.height! > 10_000) {
      throw new Error('Invalid page images.')
    }
    return { path: image.path, width: image.width!, height: image.height! }
  })
}

/** Remove stored files (R2 objects) that are no longer referenced. */
async function deleteStoredFiles(paths: string[]) {
  await deleteObjects(paths)
}

// Text parsed from a large PDF can be far longer than pasted copy (next.config raises the action body limit to match).
const MAX_ARTICLE_CHARS = 1_000_000
const articleLimitMessage = `Article text must be ${MAX_ARTICLE_CHARS.toLocaleString('en-US')} characters or fewer.`

/** Summarize after the response is sent, so saving never waits on the model. */
function scheduleSummary(issueId: string) {
  after(async () => {
    await summarizeIssue(issueId)
    revalidatePath('/admin')
    revalidatePath(`/read/${issueId}`)
  })
}

const pageSlugs = new Set(['home', 'magazine', 'about'])
const contactStatuses = new Set(['new', 'contacted', 'qualified', 'archived'])
const issueIdPattern = /^[a-zA-Z0-9-]{20,50}$/

function ownedStoragePath(value: string, userId: string, issueId: string) {
  return value.startsWith(`magazines/${userId}/${issueId}/`) && !value.includes('..') && !value.startsWith('/')
}

export async function savePageContent(input: { slug: string; title: string; content: Record<string, string>; published: boolean }) {
  const admin = await requireAdminAction()
  if (!pageSlugs.has(input.slug) || !input.title.trim() || input.title.length > 120) throw new Error('Invalid page details.')
  if (!input.content || typeof input.content !== 'object' || Array.isArray(input.content)) throw new Error('Invalid page content.')
  const entries = Object.entries(input.content)
  if (entries.length > 30 || entries.some(([key, value]) => key.length > 80 || typeof value !== 'string' || value.length > 4000)) {
    throw new Error('Page content is too large or contains invalid fields.')
  }

  await db.insert(cmsPages).values({
    userId: admin.id,
    slug: input.slug,
    title: input.title.trim(),
    content: input.content,
    published: input.published,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [cmsPages.userId, cmsPages.slug],
    set: { title: input.title.trim(), content: input.content, published: input.published, updatedAt: new Date() },
  })
  revalidatePath('/')
  revalidatePath('/magazine')
  revalidatePath('/about')
  revalidatePath('/admin')
}

export async function createMagazineIssue(input: {
  id: string
  title: string
  description: string
  articleText: string
  industry: string
  region: string
  issueDate: string
  fileUrl?: string
  coverUrl: string
  fileName?: string
  fileSize?: number
  pageImages?: PageImage[]
}) {
  const admin = await requireAdminAction()
  const pageImages = validPageImages(input.pageImages ?? [], admin.id, input.id)
  if (!issueIdPattern.test(input.id) || !input.title.trim() || input.title.length > 180) throw new Error('Invalid magazine details.')
  if (typeof input.articleText !== 'string' || input.articleText.length > MAX_ARTICLE_CHARS) throw new Error(articleLimitMessage)
  if (!input.articleText.trim() && !input.fileUrl) throw new Error('Provide a PDF, a text file, or pasted article text.')
  if (input.fileUrl && !ownedStoragePath(input.fileUrl, admin.id, input.id)) throw new Error('The issue file is not a valid upload for this account.')
  if (input.coverUrl && !ownedStoragePath(input.coverUrl, admin.id, input.id)) throw new Error('The cover image is not a valid upload for this account.')
  const fileSize = input.fileSize ?? 0
  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > 400 * 1024 * 1024) throw new Error('Issue file must be 400 MB or smaller.')
  const titleSlug = input.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'issue'
  const slug = `${titleSlug}-${input.id.slice(0, 8)}`
  // The summary is written by AI from the PDF itself (or from the text when there is no PDF).
  const summaryStatus = input.articleText.trim() || input.fileUrl ? 'pending' : ''

  await db.insert(magazineIssues).values({
    id: input.id,
    userId: admin.id,
    title: input.title.trim(),
    slug,
    description: input.description.slice(0, 2000),
    articleText: input.articleText,
    summary: '',
    summaryStatus,
    summaryModel: '',
    pageImages,
    industry: input.industry.slice(0, 80),
    region: input.region.slice(0, 80),
    issueDate: input.issueDate || null,
    fileUrl: input.fileUrl ?? null,
    coverUrl: input.coverUrl || null,
    fileName: (input.fileName ?? '').slice(0, 240),
    fileSize: Math.round(fileSize),
    published: false,
    featured: false,
  }).onConflictDoUpdate({
    target: [magazineIssues.userId, magazineIssues.slug],
    set: {
      title: input.title.trim(),
      description: input.description.slice(0, 2000),
      articleText: input.articleText,
      summary: '',
      summaryStatus,
      summaryModel: '',
      pageImages,
      industry: input.industry.slice(0, 80),
      region: input.region.slice(0, 80),
      issueDate: input.issueDate || null,
      fileUrl: input.fileUrl ?? null,
      coverUrl: input.coverUrl || null,
      fileName: (input.fileName ?? '').slice(0, 240),
      fileSize: Math.round(fileSize),
      updatedAt: new Date(),
    },
  })
  if (summaryStatus) scheduleSummary(input.id)
  revalidatePath('/admin')
  revalidatePath('/magazine')
  revalidatePath('/')
}

/**
 * Delete files uploaded by a run that then failed (a PDF preparation, or an edit whose
 * save failed), so they do not keep using storage. Only this admin's uploads for this
 * issue are deleted, and never a file the issue currently uses.
 */
export async function discardPageUploads(issueId: string, paths: string[]) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(issueId) || !Array.isArray(paths) || paths.length > MAX_PAGES + 2) throw new Error('Invalid cleanup request.')
  const [issue] = await db.select({ pageImages: magazineIssues.pageImages, fileUrl: magazineIssues.fileUrl, coverUrl: magazineIssues.coverUrl })
    .from(magazineIssues)
    .where(and(eq(magazineIssues.id, issueId), eq(magazineIssues.userId, admin.id)))
    .limit(1)
  const inUse = new Set([issue?.fileUrl, issue?.coverUrl, ...(issue?.pageImages ?? []).map((image) => image.path)])
  const removable = paths.filter((path) => typeof path === 'string' && ownedStoragePath(path, admin.id, issueId) && !inUse.has(path))
  if (removable.length) await deleteStoredFiles(removable)
}

/** Re-run the summary for an issue from its PDF or stored article text (admin "Regenerate summary"). */
export async function regenerateIssueSummary(id: string) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const [issue] = await db.select({ articleText: magazineIssues.articleText, fileUrl: magazineIssues.fileUrl })
    .from(magazineIssues)
    .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
    .limit(1)
  if (!issue) throw new Error('Issue not found.')
  if (!issue.articleText.trim() && !issue.fileUrl) throw new Error('Add a PDF or article text before generating a summary.')
  await db.update(magazineIssues).set({ summaryStatus: 'pending', updatedAt: new Date() })
    .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
  scheduleSummary(id)
  revalidatePath('/admin')
}

export async function updateMagazineIssue(id: string, input: { published?: boolean; featured?: boolean; title?: string; articleText?: string; pageImages?: PageImage[] }) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const set: Partial<typeof magazineIssues.$inferInsert> = { updatedAt: new Date() }
  let replacedPagePaths: string[] = []
  if (input.pageImages !== undefined) {
    set.pageImages = validPageImages(input.pageImages, admin.id, id)
    const [current] = await db.select({ pageImages: magazineIssues.pageImages })
      .from(magazineIssues)
      .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
      .limit(1)
    const kept = new Set(set.pageImages.map((image) => image.path))
    replacedPagePaths = (current?.pageImages ?? []).map((image) => image.path).filter((path) => !kept.has(path) && ownedStoragePath(path, admin.id, id))
  }
  if (input.published !== undefined) set.published = input.published
  if (input.featured !== undefined) set.featured = input.featured
  if (input.articleText !== undefined) {
    if (typeof input.articleText !== 'string' || input.articleText.length > MAX_ARTICLE_CHARS) throw new Error(articleLimitMessage)
    set.articleText = input.articleText
  }
  if (input.articleText !== undefined || input.pageImages !== undefined) {
    // An AI summary read from the PDF stays valid when text or reader pages change. Without one,
    // new text or pages (which Gemini reads for PDFs over 50 MB) are a reason to try again.
    const [current] = await db.select({ fileUrl: magazineIssues.fileUrl, summaryModel: magazineIssues.summaryModel })
      .from(magazineIssues)
      .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
      .limit(1)
    if (current && !current.summaryModel) {
      const hasText = (input.articleText ?? '').trim() || input.articleText === undefined
      if (current.fileUrl || hasText) set.summaryStatus = 'pending'
    }
  }
  if (input.title !== undefined) {
    if (!input.title.trim() || input.title.length > 180) throw new Error('Invalid issue title.')
    set.title = input.title.trim()
  }
  if (input.published === true) {
    const [issue] = await db.select({ articleText: magazineIssues.articleText, fileUrl: magazineIssues.fileUrl })
      .from(magazineIssues)
      .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
      .limit(1)
    const articleText = input.articleText ?? issue?.articleText
    if (!articleText?.trim() && !issue?.fileUrl) throw new Error('Add article text or a PDF before publishing this issue.')
  }
  if (input.featured === true) {
    await db.update(magazineIssues).set({ featured: false, updatedAt: new Date() }).where(eq(magazineIssues.userId, admin.id))
  }
  await db.update(magazineIssues).set(set).where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
  if (replacedPagePaths.length) await deleteStoredFiles(replacedPagePaths)
  if (set.summaryStatus === 'pending') scheduleSummary(id)
  revalidatePath('/admin')
  revalidatePath('/magazine')
  revalidatePath(`/read/${id}`)
  revalidatePath('/')
}

/** Written to `summaryModel` when an editor rewrites the summary by hand. */
const EDITED_SUMMARY = 'edited'

/**
 * Save the "Edit magazine" page. Only the fields present in `input` change.
 * - `coverUrl`: a new upload's key, or null to remove the cover.
 * - `pdf`: a replacement PDF already uploaded, with its reader pages; the old PDF and pages are deleted.
 * - `summary`: an editor's own text, which replaces the AI summary until it is regenerated.
 */
export async function editMagazineIssue(id: string, input: {
  title?: string
  description?: string
  industry?: string
  region?: string
  issueDate?: string
  published?: boolean
  featured?: boolean
  articleText?: string
  summary?: string
  coverUrl?: string | null
  pdf?: { fileUrl: string; fileName: string; fileSize: number; pageImages: PageImage[] }
}) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const owned = and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id))
  const [current] = await db.select({
    articleText: magazineIssues.articleText,
    fileUrl: magazineIssues.fileUrl,
    coverUrl: magazineIssues.coverUrl,
    pageImages: magazineIssues.pageImages,
    summaryModel: magazineIssues.summaryModel,
  }).from(magazineIssues).where(owned).limit(1)
  if (!current) throw new Error('Issue not found.')

  const set: Partial<typeof magazineIssues.$inferInsert> = { updatedAt: new Date() }
  const removedPaths: string[] = []

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 180) throw new Error('The title must be 1 to 180 characters.')
    set.title = input.title.trim()
  }
  if (input.description !== undefined) set.description = String(input.description).trim().slice(0, 2000)
  if (input.industry !== undefined) set.industry = String(input.industry).trim().slice(0, 80)
  if (input.region !== undefined) set.region = String(input.region).trim().slice(0, 80)
  if (input.issueDate !== undefined) {
    if (input.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) throw new Error('Invalid issue date.')
    set.issueDate = input.issueDate || null
  }
  if (input.articleText !== undefined) {
    if (typeof input.articleText !== 'string' || input.articleText.length > MAX_ARTICLE_CHARS) throw new Error(articleLimitMessage)
    set.articleText = input.articleText
  }

  if (input.coverUrl !== undefined) {
    if (input.coverUrl !== null && (typeof input.coverUrl !== 'string' || !ownedStoragePath(input.coverUrl, admin.id, id))) {
      throw new Error('The cover image is not a valid upload for this account.')
    }
    set.coverUrl = input.coverUrl
    if (current.coverUrl && current.coverUrl !== input.coverUrl && ownedStoragePath(current.coverUrl, admin.id, id)) removedPaths.push(current.coverUrl)
  }

  if (input.pdf !== undefined) {
    const { fileUrl, fileName, fileSize } = input.pdf
    if (typeof fileUrl !== 'string' || !ownedStoragePath(fileUrl, admin.id, id)) throw new Error('The issue file is not a valid upload for this account.')
    if (!Number.isFinite(fileSize) || fileSize < 1 || fileSize > 400 * 1024 * 1024) throw new Error('Issue file must be 400 MB or smaller.')
    set.fileUrl = fileUrl
    set.fileName = String(fileName ?? '').slice(0, 240)
    set.fileSize = Math.round(fileSize)
    set.pageImages = validPageImages(input.pdf.pageImages, admin.id, id)
    const kept = new Set([fileUrl, ...set.pageImages.map((image) => image.path)])
    for (const path of [current.fileUrl, ...current.pageImages.map((image) => image.path)]) {
      if (path && !kept.has(path) && ownedStoragePath(path, admin.id, id)) removedPaths.push(path)
    }
  }

  const fileUrl = set.fileUrl ?? current.fileUrl
  const articleText = set.articleText ?? current.articleText
  if (!fileUrl && !articleText.trim()) throw new Error('An issue needs a PDF or article text.')

  // Summary: an editor's own text wins. Otherwise a new PDF always gets a new AI summary, and
  // new article text does when the current summary was not written by AI or an editor.
  if (input.summary !== undefined) {
    if (typeof input.summary !== 'string' || input.summary.length > 20_000) throw new Error('The summary must be 20,000 characters or fewer.')
    const summary = input.summary.trim()
    set.summary = summary
    set.summaryStatus = summary ? 'ready' : ''
    set.summaryModel = summary ? EDITED_SUMMARY : ''
  } else if (input.pdf !== undefined || (input.articleText !== undefined && input.articleText !== current.articleText && !current.summaryModel)) {
    set.summaryStatus = 'pending'
  }

  if (input.published !== undefined) set.published = Boolean(input.published)
  if (input.featured !== undefined) set.featured = Boolean(input.featured)
  if (input.featured === true) {
    await db.update(magazineIssues).set({ featured: false, updatedAt: new Date() }).where(eq(magazineIssues.userId, admin.id))
  }

  await db.update(magazineIssues).set(set).where(owned)
  // Delete replaced files only after the issue no longer points at them.
  if (removedPaths.length) await deleteStoredFiles(removedPaths)
  if (set.summaryStatus === 'pending') scheduleSummary(id)
  revalidatePath('/admin')
  revalidatePath(`/admin/issues/${id}/edit`)
  revalidatePath('/magazine')
  revalidatePath(`/read/${id}`)
  revalidatePath(`/read/${id}/book`)
  revalidatePath('/')
}

export async function deleteMagazineIssue(id: string) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const [issue] = await db.select({ fileUrl: magazineIssues.fileUrl, coverUrl: magazineIssues.coverUrl, pageImages: magazineIssues.pageImages })
    .from(magazineIssues)
    .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
    .limit(1)
  if (!issue) return
  await db.delete(magazineIssues).where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
  const ownedPaths = [issue.fileUrl, issue.coverUrl, ...issue.pageImages.map((image) => image.path)]
    .filter((path): path is string => Boolean(path) && ownedStoragePath(path!, admin.id, id))
  if (ownedPaths.length) await deleteStoredFiles(ownedPaths)
  revalidatePath('/admin')
  revalidatePath('/magazine')
  revalidatePath('/')
}

export async function updateContact(id: string, input: { status: string; notes: string }) {
  const admin = await requireAdminAction()
  if (!contactStatuses.has(input.status) || id.length > 50 || input.notes.length > 3000) throw new Error('Invalid contact update.')
  await db.update(crmContacts).set({ status: input.status, notes: input.notes, updatedAt: new Date() })
    .where(and(eq(crmContacts.id, id), eq(crmContacts.userId, admin.id)))
  revalidatePath('/admin')
}

