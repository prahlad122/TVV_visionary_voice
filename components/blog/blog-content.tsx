import { Fragment, type ReactNode } from 'react'

/**
 * Renders a blog post written in light Markdown, the format the admin's blog editor writes:
 *
 *   ## Heading / ### Smaller heading      > Quote
 *   - Bullet / 1. Numbered item           --- (divider)
 *   **bold**  *italic*  `code`  [link text](https://…)
 *
 * Blank lines separate paragraphs. Everything is built as React elements, never as raw HTML,
 * so text in a post cannot inject markup or scripts. Used by the public post page and the
 * editor's preview, so both show the same thing.
 */
export function BlogContent({ content }: { content: string }) {
  return <>{parseBlocks(content).map((block, index) => renderBlock(block, index))}</>
}

type Block =
  | { type: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { type: 'ul' | 'ol'; items: string[] }
  | { type: 'hr' }

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  const lines = content.replace(/\r\n?/g, '\n').split('\n')
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()
    if (!line) { flush(); continue }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ type: 'hr' }); continue }
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flush()
      // A single # is the post title's level, so it is shown as a section heading too.
      blocks.push({ type: heading[1].length === 3 ? 'h3' : 'h2', text: heading[2] })
      continue
    }
    if (line.startsWith('>')) {
      flush()
      const quote = [line.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && lines[index + 1].trim().startsWith('>')) quote.push(lines[++index].trim().replace(/^>\s?/, ''))
      blocks.push({ type: 'quote', text: quote.join(' ') })
      continue
    }
    const listPattern = /^[-*•]\s+/.test(line) ? /^[-*•]\s+/ : /^\d+[.)]\s+/.test(line) ? /^\d+[.)]\s+/ : null
    if (listPattern) {
      flush()
      const items = [line.replace(listPattern, '')]
      while (index + 1 < lines.length && listPattern.test(lines[index + 1].trim())) items.push(lines[++index].trim().replace(listPattern, ''))
      blocks.push({ type: listPattern.source.startsWith('^\\d') ? 'ol' : 'ul', items })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

function renderBlock(block: Block, key: number) {
  switch (block.type) {
    case 'h2': return <h2 key={key}>{inline(block.text)}</h2>
    case 'h3': return <h3 key={key}>{inline(block.text)}</h3>
    case 'quote': return <blockquote key={key}><p>{inline(block.text)}</p></blockquote>
    case 'ul': return <ul key={key}>{block.items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ul>
    case 'ol': return <ol key={key}>{block.items.map((item, index) => <li key={index}>{inline(item)}</li>)}</ol>
    case 'hr': return <hr key={key} />
    default: return <p key={key}>{inline(block.text)}</p>
  }
}

/** Only web and site-relative links are made clickable (no javascript: or data: URLs). */
function safeHref(href: string) {
  const value = href.trim()
  if (/^https?:\/\//i.test(value) || /^mailto:/i.test(value)) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (value.startsWith('#')) return value
  return null
}

const inlinePattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_/g

function inline(text: string): ReactNode {
  const parts: ReactNode[] = []
  let last = 0
  let key = 0
  for (const match of text.matchAll(inlinePattern)) {
    const start = match.index ?? 0
    if (start > last) parts.push(text.slice(last, start))
    const [whole, bold, code, linkText, linkHref, italic, underscoreItalic] = match
    if (bold !== undefined) parts.push(<strong key={key++}>{inline(bold)}</strong>)
    else if (code !== undefined) parts.push(<code key={key++}>{code}</code>)
    else if (linkText !== undefined) {
      const href = safeHref(linkHref)
      const external = href ? /^https?:\/\//i.test(href) : false
      parts.push(href
        ? <a key={key++} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{inline(linkText)}</a>
        : <Fragment key={key++}>{whole}</Fragment>)
    } else parts.push(<em key={key++}>{inline(italic ?? underscoreItalic ?? '')}</em>)
    last = start + whole.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : parts
}

/** The post's words without Markdown symbols, e.g. for reading time or a fallback excerpt. */
export function plainText(content: string) {
  return content
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(#{1,3}|>|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/^\s*(-{3,}|\*{3,})\s*$/gm, '')
    .replace(/\*\*|`|\*|_/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function readingMinutes(content: string) {
  const words = plainText(content).split(' ').filter(Boolean).length
  return Math.max(1, Math.round(words / 220))
}
