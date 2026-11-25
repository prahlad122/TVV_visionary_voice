/**
 * Repairs common artifacts in text extracted from designed PDFs. Safe to run
 * more than once, so it is applied both when text is extracted and when stored
 * text is displayed (which also fixes issues parsed before this existed).
 */
export function tidyExtractedText(text: string) {
  return text
    // Letter-spaced capitals come out as "C E R T I F I C AT I O N": join runs of 1–2 capital
    // chunks that start and end on a single letter and are mostly single letters. Lowercase
    // text is never touched, so ordinary words ("go to a b") are left alone.
    .replace(/\b\p{Lu} (?:\p{Lu}{1,2} ){2,}\p{Lu}\b/gu, (run) => {
      const chunks = run.split(' ')
      const singles = chunks.filter((chunk) => chunk.length === 1).length
      return singles / chunks.length >= 0.6 ? chunks.join('') : run
    })
    // Apostrophes set as separate glyphs come out as "Today ’ s": close them up.
    .replace(/(\p{L})\s+([’ʼ'])\s+(s|t|re|ve|ll|d|m)\b/gu, '$1$2$3')
    .replace(/[ \t]{2,}/g, ' ')
}

/** A heading glued onto a sentence ("The Reality: What Today's Graduate Is Facing A degree…") is mostly capitalized words. */
function readsLikeProse(sentence: string) {
  const words = sentence.split(' ').filter((word) => /\p{L}/u.test(word))
  if (words.length < 8 || words.length > 45) return false
  const capitalized = words.filter((word) => /^[\p{Lu}]/u.test(word)).length
  return /^[\p{Lu}\d"“‘(]/u.test(sentence) && capitalized / words.length < 0.4 && sentence !== sentence.toUpperCase()
}

/**
 * The summary used when no Claude API key is configured: the opening sentences
 * of the article's prose. Designed PDFs mix headings, web addresses and labels
 * in with the prose, so only sentences that read as prose are used.
 */
export function leadSummary(text: string, maxWords = 90) {
  const tidy = tidyExtractedText(text)
  const flat = tidy
    .split(/\n\s*\n/)
    // Drop title-cased heading blocks ("The Silent Revolution of Urban Green Spaces") so they are
    // not glued onto the first sentence that follows them.
    .filter((block) => {
      const words = block.trim().split(/\s+/).filter((word) => /\p{L}/u.test(word))
      const capitalized = words.filter((word) => /^[\p{Lu}]/u.test(word)).length
      return /[.!?]["”’)]?\s*$/.test(block) || words.length > 12 || capitalized / Math.max(1, words.length) < 0.5
    })
    .join('\n\n')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\S+@\S+\.\S+/g, ' ')
    .replace(/\s+/g, ' ')
  const sentences = (flat.match(/[^.!?]+[.!?]+["”’)]?(?=\s|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(readsLikeProse)
  let summary = ''
  for (const sentence of sentences) {
    const next = `${summary} ${sentence}`.trim()
    if (next.split(' ').length > maxWords && summary) break
    summary = next
  }
  return summary || flat.slice(0, 600).trim()
}

/** A block of a summary article: a section heading or a paragraph. */
export type SummaryBlock = { type: 'heading' | 'paragraph'; text: string }

/**
 * Summaries are stored as plain text: paragraphs separated by blank lines, and
 * section headings on lines starting with "## ". Older one-paragraph summaries
 * parse as a single paragraph.
 */
export function parseSummary(summary: string): SummaryBlock[] {
  return summary.split(/\n\s*\n|\n(?=#{1,3} )/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const heading = block.match(/^#{1,3}\s+(.+)$/)
      return heading && !heading[1].includes('\n')
        ? { type: 'heading' as const, text: heading[1].replace(/\*\*/g, '').trim() }
        : { type: 'paragraph' as const, text: block.replace(/\*\*/g, '').replace(/\s+/g, ' ') }
    })
}

const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

/** "THE FUTURE OF AI" → "The Future of AI": all-caps headings read as shouting in body copy. */
function headingCase(text: string) {
  if (text !== text.toUpperCase()) return text
  return text.toLowerCase().split(' ').map((word, index) => {
    if (index > 0 && smallWords.has(word)) return word
    if (word.length <= 3 && !smallWords.has(word)) return word.toUpperCase()
    return word.charAt(0).toUpperCase() + word.slice(1)
  }).join(' ')
}

function proseSentences(block: string) {
  const flat = block.replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ').replace(/\S+@\S+\.\S+/g, ' ').replace(/\s+/g, ' ')
  return (flat.match(/[^.!?]+[.!?]+["”’)]?(?=\s|$)/g) ?? []).map((sentence) => sentence.trim()).filter((sentence) => {
    const words = sentence.split(' ').filter((word) => /\p{L}/u.test(word))
    const capitalized = words.filter((word) => /^[\p{Lu}]/u.test(word)).length
    return words.length >= 6 && words.length <= 50 && /^[\p{Lu}\d"“‘(]/u.test(sentence)
      && capitalized / words.length < 0.45 && sentence !== sentence.toUpperCase()
  })
}

/** PDF text boxes split sentences across blocks ("…expects evidence of" / "practical capability."): rejoin them. */
function joinBrokenBlocks(blocks: string[]) {
  const merged: string[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    if (previous && (/[,–—-]$/.test(previous) || (!/[.!?:;"”’)]$/.test(previous) && /^\p{Ll}/u.test(block)))) merged[merged.length - 1] = `${previous} ${block}`
    else merged.push(block)
  }
  return merged
}

/** A short line without closing punctuation, in title case or sentence case: "The Reality:", "Lack of real project experience". */
function looksLikeHeading(block: string) {
  const words = block.split(/\s+/).filter((word) => /\p{L}/u.test(word))
  if (!words.length || words.length > 10 || /[.!?,;]["”’)]?$/.test(block) || /https?:|www\.|@|\d+\s*\/\s*\d+/.test(block)) return false
  return /^[\p{Lu}\d]/u.test(block)
}

/**
 * The article-style summary used when no Claude API key is configured: an
 * opening paragraph, then the issue's own section headings, each with the
 * first sentences of prose that follow it. Every sentence comes from the text.
 */
export function articleSummary(text: string) {
  const blocks = joinBrokenBlocks(tidyExtractedText(text).split(/\n\s*\n/).map((block) => block.replace(/\s+/g, ' ').trim()).filter(Boolean))
  // Opening paragraph: the first sentences of prose in the issue.
  const allSentences = blocks.filter((block) => !looksLikeHeading(block)).flatMap(proseSentences)
  let standfirst = ''
  for (const sentence of allSentences) {
    const next = `${standfirst} ${sentence}`.trim()
    if (next.split(' ').length > 70 && standfirst) break
    standfirst = next
  }
  if (!standfirst) return leadSummary(text)
  const used = new Set(proseSentences(standfirst))
  const sections: { heading: string; sentences: string[] }[] = []
  const seenHeadings = new Set<string>()
  let current: { heading: string; sentences: string[] } | null = null
  const loose: string[] = []

  for (const block of blocks) {
    if (looksLikeHeading(block)) {
      const heading = headingCase(block)
      // Repeated headings are usually running headers or taglines, not sections.
      if (heading.length < 4 || seenHeadings.has(heading.toLowerCase())) { current = null; continue }
      seenHeadings.add(heading.toLowerCase())
      current = { heading, sentences: [] }
      sections.push(current)
      continue
    }
    for (const sentence of proseSentences(block)) {
      if (used.has(sentence)) continue
      used.add(sentence)
      ;(current ? current.sentences : loose).push(sentence)
    }
  }

  const paragraph = (sentences: string[], maxWords: number) => {
    let result = ''
    for (const sentence of sentences) {
      const next = `${result} ${sentence}`.trim()
      if (next.split(' ').length > maxWords && result) break
      result = next
    }
    return result
  }

  const parts = [standfirst]
  const wordCount = (sentences: string[]) => sentences.join(' ').split(' ').length
  const headed = sections.filter((section) => wordCount(section.sentences) >= 25).slice(0, 5)
  if (headed.length >= 2) {
    for (const section of headed) parts.push(`## ${section.heading}`, paragraph(section.sentences, 90))
  } else {
    // No usable headings: continue with a few plain paragraphs of the issue's prose.
    const rest = [...loose, ...sections.flatMap((section) => section.sentences)]
    for (let index = 0; index < rest.length && parts.length < 4; index += 3) parts.push(paragraph(rest.slice(index, index + 3), 90))
  }
  return parts.filter(Boolean).join('\n\n')
}
