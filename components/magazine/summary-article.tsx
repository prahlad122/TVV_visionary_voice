import { parseSummary } from '@/lib/text-tidy'

/** Renders a stored summary ("## " headings and paragraphs) as article copy. */
export function SummaryArticle({ summary, headingLevel = 2 }: { summary: string; headingLevel?: 2 | 3 | 5 }) {
  const Heading = `h${headingLevel}` as const
  let paragraphIndex = 0
  return <>{parseSummary(summary).map((block, index) => block.type === 'heading'
    ? <Heading key={index} className="summary-heading editorial">{block.text}</Heading>
    : <p key={index} className={paragraphIndex++ === 0 ? 'summary-lede' : undefined}>{block.text}</p>)}</>
}
