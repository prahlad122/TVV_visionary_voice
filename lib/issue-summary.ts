// Server-only: imported from the admin server actions. Reads API keys, R2 storage and the database.
import { GoogleGenAI, FileState, createPartFromBase64, createPartFromUri, type Part } from '@google/genai'
import Groq from 'groq-sdk'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { magazineIssues, type PageImage } from '@/lib/db/schema'
import { getObject, headObject } from '@/lib/storage'
import { articleSummary } from '@/lib/text-tidy'

/**
 * Writes "The issue in brief" for a magazine issue, once, after it is uploaded.
 * The result is stored in the database; readers never trigger a summary.
 *
 * 1. Groq (gpt-oss-120b) summarizes the text extracted from the PDF at upload
 *    (or pasted). It accepts text only, so it is skipped for an issue with no text.
 * 2. If Groq fails or the issue has no text, Gemini reads the issue itself: the
 *    original PDF when it is within Gemini's 50 MB PDF limit, otherwise the page
 *    images rendered at upload.
 * 3. If both fail or no keys are set, an extract of the issue's own sentences.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash'
const GROQ_MODEL = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b'
const GEMINI_PDF_LIMIT = 50 * 1024 * 1024
const GEMINI_INLINE_LIMIT = 18 * 1024 * 1024
const GEMINI_MAX_PAGES = 1000
// Groq writes a quick summary from the start of the issue only: the first GROQ_MAX_CHARS
// characters (default 8,000, about 2,000 tokens) are sent and the rest is never sent. That keeps
// each request small and fast, well inside the free tier's 8,000 tokens per minute.
const GROQ_MAX_CHARS = Number(process.env.GROQ_MAX_CHARS) || 8_000
const GROQ_MAX_OUTPUT_TOKENS = 1500

const QUICK_SYSTEM_PROMPT = `You write a quick "issue in brief" for a business magazine on The Visionary Voice website: a short piece readers skim on the web page.
You are given only the opening part of the issue's text. Summarize what is there; do not guess at what comes later.

Format it exactly like this, in 150 to 250 words:
- An opening paragraph of 2 or 3 sentences saying what the issue is about.
- Then 2 or 3 sections. Put each section heading on its own line starting with "## " followed by a short heading (under 8 words), then one short paragraph.
- Separate every paragraph and heading with a blank line.
- Use only "## " headings and plain paragraphs: no title line, no bullet lists, bold, links or other markdown, and no preamble such as "Here is the summary".

Name the people, companies and themes the text actually covers. Use only facts from the text; never invent names, numbers, quotes or claims.
Ignore page furniture such as page numbers, running headers, ads and repeated taglines.`

/** The first `limit` characters of the text, cut back to the last paragraph or sentence break. */
function openingText(text: string, limit: number) {
  if (text.length <= limit) return text
  const head = text.slice(0, limit)
  const cut = Math.max(head.lastIndexOf('\n\n'), head.lastIndexOf('. ') + 1)
  return cut > limit * 0.6 ? head.slice(0, cut).trim() : head.trim()
}

const SYSTEM_PROMPT = `You write "The issue in brief" for a business magazine on The Visionary Voice website: a short article that readers read on the web page instead of the full issue.
It should read like magazine journalism: tell them who and what the issue covers, the ideas and stories inside it, and why they matter.

Format it exactly like this, in 350 to 600 words:
- Start with an opening paragraph of 2 or 3 sentences that draws the reader in and sets out what the issue is about.
- Then write 3 to 5 sections. Put each section heading on its own line starting with "## " followed by a short heading (under 8 words). Follow each heading with 1 or 2 paragraphs.
- Separate every paragraph and heading with a blank line.
- Use only "## " headings and plain paragraphs: no title line (the page already shows the issue title), no bullet lists, bold, links or other markdown, and no preamble such as "Here is the summary".

Name the people, companies and themes the issue actually covers. Use only facts from the issue; never invent names, numbers, quotes or claims.
Ignore page furniture such as page numbers, running headers, ads and repeated taglines.`

type IssueForSummary = { id: string; title: string; description: string; articleText: string; fileUrl: string | null; pageImages: PageImage[] }

function issueHeader(issue: IssueForSummary) {
  return `Issue title: ${issue.title}${issue.description ? `\nIssue description: ${issue.description}` : ''}`
}

/** Tidy a model's answer into the stored format, and reject answers that are too short to be the article. */
function cleanSummary(raw: string, minWords = 80) {
  const summary = raw
    .replace(/^```[a-z]*\n?|\n?```$/g, '')
    .split('\n')
    .map((line) => {
      const bold = line.trim().match(/^\*\*(.+?)\*\*:?$/)
      if (bold) return `## ${bold[1]}`
      return line.replace(/^#{3,}\s+/, '## ')
    })
    .filter((line, index) => !(index === 0 && /^#\s/.test(line)))
    .join('\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (summary.split(/\s+/).length < minWords) throw new Error('The summary came back too short.')
  return summary
}

async function readStoredFile(key: string) {
  const object = await getObject(key)
  if (!object) throw new Error(`Stored file is missing: ${key}`)
  return new Response(object.stream).blob()
}

async function uploadToGemini(ai: GoogleGenAI, file: Blob, mimeType: string) {
  let uploaded = await ai.files.upload({ file, config: { mimeType } })
  // Large PDFs are processed before they can be used; wait up to about two minutes.
  for (let attempt = 0; uploaded.state === FileState.PROCESSING && attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    uploaded = await ai.files.get({ name: uploaded.name! })
  }
  if (uploaded.state !== FileState.ACTIVE || !uploaded.uri) throw new Error(`Gemini could not process the file (${uploaded.state}).`)
  return uploaded
}

async function summarizeWithGemini(issue: IssueForSummary) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  const geminiFiles: string[] = []
  try {
    let parts: Part[]
    let description: string
    const pdfSize = issue.fileUrl ? (await headObject(issue.fileUrl))?.size ?? 0 : 0

    if (issue.fileUrl && pdfSize > 0 && pdfSize <= GEMINI_PDF_LIMIT) {
      // The original PDF, read directly by Gemini.
      const pdf = await readStoredFile(issue.fileUrl)
      if (pdf.size <= GEMINI_INLINE_LIMIT) {
        parts = [createPartFromBase64(Buffer.from(await pdf.arrayBuffer()).toString('base64'), 'application/pdf')]
      } else {
        const uploaded = await uploadToGemini(ai, pdf, 'application/pdf')
        geminiFiles.push(uploaded.name!)
        parts = [createPartFromUri(uploaded.uri!, 'application/pdf')]
      }
      description = 'The attached PDF is the complete magazine issue.'
    } else if (issue.pageImages.length) {
      // Too large for Gemini's PDF limit: send the page images rendered at upload, in order.
      const pages = issue.pageImages.slice(0, GEMINI_MAX_PAGES)
      const images: Blob[] = []
      for (let index = 0; index < pages.length; index += 8) {
        images.push(...await Promise.all(pages.slice(index, index + 8).map((page) => readStoredFile(page.path))))
      }
      const total = images.reduce((sum, image) => sum + image.size, 0)
      if (total <= GEMINI_INLINE_LIMIT) {
        parts = await Promise.all(images.map(async (image) => createPartFromBase64(Buffer.from(await image.arrayBuffer()).toString('base64'), image.type || 'image/webp')))
      } else {
        parts = []
        for (let index = 0; index < images.length; index += 6) {
          const uploaded = await Promise.all(images.slice(index, index + 6).map((image) => uploadToGemini(ai, image, image.type || 'image/webp')))
          for (const file of uploaded) {
            geminiFiles.push(file.name!)
            parts.push(createPartFromUri(file.uri!, file.mimeType ?? 'image/webp'))
          }
        }
      }
      description = `The attached ${pages.length} images are the pages of the magazine issue, in order.`
    } else {
      throw new Error(issue.fileUrl ? 'The PDF is over 50 MB and has no reader pages to send instead.' : 'The issue has no PDF.')
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts: [...parts, { text: `${issueHeader(issue)}\n\n${description}\n\nWrite the issue in brief.` }] }],
      config: { systemInstruction: SYSTEM_PROMPT, maxOutputTokens: 8192 },
    })
    const text = response.text
    if (!text) throw new Error(`Gemini returned no text (${response.candidates?.[0]?.finishReason ?? response.promptFeedback?.blockReason ?? 'unknown reason'}).`)
    return cleanSummary(text)
  } finally {
    // Gemini keeps uploads for 48 hours; remove them now that the summary is written.
    await Promise.allSettled(geminiFiles.map((name) => ai.files.delete({ name })))
  }
}

async function summarizeWithGroq(issue: IssueForSummary) {
  const text = issue.articleText.trim()
  if (!text) throw new Error('No extracted text to send to Groq.')
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    reasoning_effort: 'low',
    include_reasoning: false,
    max_completion_tokens: GROQ_MAX_OUTPUT_TOKENS,
    messages: [
      { role: 'system', content: QUICK_SYSTEM_PROMPT },
      { role: 'user', content: `${issueHeader(issue)}\n\nThe text below is the opening of the issue, extracted from its PDF, so its layout may be broken.\n\n<issue_text>\n${openingText(text, GROQ_MAX_CHARS)}\n</issue_text>\n\nWrite the quick issue in brief.` },
    ],
  })
  const content = completion.choices[0]?.message?.content
  if (!content) throw new Error(`Groq returned no text (${completion.choices[0]?.finish_reason ?? 'unknown reason'}).`)
  return cleanSummary(content, 60)
}

/**
 * Generate and store the summary for one issue. Runs after the upload response
 * is sent (see `after()` in the admin actions), so admins never wait on it.
 * Failures are logged and recorded, not thrown.
 */
export async function summarizeIssue(issueId: string) {
  const [issue] = await db.select({
    id: magazineIssues.id,
    title: magazineIssues.title,
    description: magazineIssues.description,
    articleText: magazineIssues.articleText,
    fileUrl: magazineIssues.fileUrl,
    pageImages: magazineIssues.pageImages,
  }).from(magazineIssues).where(eq(magazineIssues.id, issueId)).limit(1)
  if (!issue) return

  if (!issue.fileUrl && !issue.articleText.trim()) {
    await db.update(magazineIssues).set({ summary: '', summaryStatus: '', summaryModel: '' }).where(eq(magazineIssues.id, issueId))
    return
  }

  const attempts: { model: string; run: () => Promise<string> }[] = []
  // Groq first; it needs text, so an issue without any goes straight to Gemini.
  if (process.env.GROQ_API_KEY && issue.articleText.trim()) attempts.push({ model: GROQ_MODEL, run: () => summarizeWithGroq(issue) })
  if (process.env.GEMINI_API_KEY) attempts.push({ model: GEMINI_MODEL, run: () => summarizeWithGemini(issue) })

  for (const attempt of attempts) {
    try {
      const summary = await attempt.run()
      await db.update(magazineIssues).set({ summary, summaryStatus: 'ready', summaryModel: attempt.model }).where(eq(magazineIssues.id, issueId))
      return
    } catch (error) {
      console.error(`[summary] ${attempt.model} could not summarize issue ${issueId}:`, error instanceof Error ? error.message : error)
    }
  }

  // No AI available or every model failed: fall back to sentences taken from the issue's own text.
  const fallback = issue.articleText.trim() ? articleSummary(issue.articleText) : ''
  await db.update(magazineIssues)
    .set(fallback ? { summary: fallback, summaryStatus: 'ready', summaryModel: '' } : { summaryStatus: 'failed' })
    .where(eq(magazineIssues.id, issueId))
}
