'use server'

import { del } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { requireAdminAction } from '@/lib/admin-auth'
import { db } from '@/lib/db'
import { cmsPages, crmContacts, magazineIssues } from '@/lib/db/schema'

const pageSlugs = new Set(['home', 'magazine', 'about'])
const contactStatuses = new Set(['new', 'contacted', 'qualified', 'archived'])
const issueIdPattern = /^[a-zA-Z0-9-]{20,50}$/

function ownedBlobPath(value: string, userId: string, issueId: string) {
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
}) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(input.id) || !input.title.trim() || input.title.length > 180) throw new Error('Invalid magazine details.')
  if (typeof input.articleText !== 'string' || input.articleText.length > 120_000) throw new Error('Article text must be 120,000 characters or fewer.')
  if (!input.articleText.trim() && !input.fileUrl) throw new Error('Provide a PDF, a text file, or pasted article text.')
  if (input.fileUrl && !ownedBlobPath(input.fileUrl, admin.id, input.id)) throw new Error('The issue file is not a valid upload for this account.')
  if (input.coverUrl && !ownedBlobPath(input.coverUrl, admin.id, input.id)) throw new Error('The cover image is not a valid upload for this account.')
  const fileSize = input.fileSize ?? 0
  if (!Number.isFinite(fileSize) || fileSize < 0 || fileSize > 400 * 1024 * 1024) throw new Error('Issue file must be 400 MB or smaller.')
  const titleSlug = input.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'issue'
  const slug = `${titleSlug}-${input.id.slice(0, 8)}`

  await db.insert(magazineIssues).values({
    id: input.id,
    userId: admin.id,
    title: input.title.trim(),
    slug,
    description: input.description.slice(0, 2000),
    articleText: input.articleText,
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
  revalidatePath('/admin')
  revalidatePath('/magazine')
  revalidatePath('/')
}

export async function updateMagazineIssue(id: string, input: { published?: boolean; featured?: boolean; title?: string; articleText?: string }) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const set: Partial<typeof magazineIssues.$inferInsert> = { updatedAt: new Date() }
  if (input.published !== undefined) set.published = input.published
  if (input.featured !== undefined) set.featured = input.featured
  if (input.articleText !== undefined) {
    if (typeof input.articleText !== 'string' || input.articleText.length > 120_000) throw new Error('Article text must be 120,000 characters or fewer.')
    set.articleText = input.articleText
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
  revalidatePath('/admin')
  revalidatePath('/magazine')
  revalidatePath(`/read/${id}`)
  revalidatePath('/')
}

export async function deleteMagazineIssue(id: string) {
  const admin = await requireAdminAction()
  if (!issueIdPattern.test(id)) throw new Error('Invalid issue.')
  const [issue] = await db.select({ fileUrl: magazineIssues.fileUrl, coverUrl: magazineIssues.coverUrl })
    .from(magazineIssues)
    .where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
    .limit(1)
  if (!issue) return
  await db.delete(magazineIssues).where(and(eq(magazineIssues.id, id), eq(magazineIssues.userId, admin.id)))
  const ownedPaths = [issue.fileUrl, issue.coverUrl].filter((path): path is string => Boolean(path) && ownedBlobPath(path!, admin.id, id))
  if (ownedPaths.length) await del(ownedPaths)
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

