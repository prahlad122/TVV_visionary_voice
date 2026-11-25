import Image from 'next/image'

export type ReaderPageImage = { url: string; width: number; height: number }

export type Issue = {
  id: string
  fileUrl?: string
  featured?: boolean
  description?: string
  articleText?: string
  /** Generated from the article text when the issue is saved. */
  summary?: string
  /** Pre-rendered page images for the magazine reader; when present the reader never loads the PDF. */
  pages?: ReaderPageImage[]
  title: string
  date: string
  region: string
  industry: string
  image: string
  coverLabel: string
  coverName: string
}

export const issues: Issue[] = [
  { id: "edition-agustin-correa", title: "Top 10 CEOs Inspiring the Business World 2022", date: "2022", region: "Global", industry: "Leadership", image: "/edition-agustin-correa.png", coverLabel: "Leadership", coverName: "Agustin Correa", description: "Combining analytical skills with business insights to promote change and contribute to organizational growth.", featured: true },
  { id: "edition-laurie-stach", title: "Top 10 Unstoppable Women Entrepreneurs of 2022", date: "2022", region: "Global", industry: "Entrepreneurship", image: "/edition-laurie-stach.png", coverLabel: "Entrepreneurship", coverName: "Laurie Stach", description: "Featuring Laurie Stach in an edition celebrating unstoppable women entrepreneurs.", featured: false },
  { id: "edition-nicolas-canada", title: "Canada’s Most Influential Business Leaders of the Year, 2023", date: "2023", region: "Canada", industry: "Leadership", image: "/edition-nicolas-canada.png", coverLabel: "Leadership", coverName: "Nicolas", description: "A Canadian business leadership edition on establishing long-term vision and ensuring success.", featured: false },
  { id: "edition-paul-donald", title: "Canada’s Most Promising Companies, 2022", date: "2022", region: "Canada", industry: "Business", image: "/edition-paul-donald.png", coverLabel: "Business", coverName: "Paul Donald", description: "Featuring Paul Donald, CEO and Co-Founder of Encircle, and the company’s work helping restorers document and present high-quality reports.", featured: false },
  { id: "edition-aima-lodhi", title: "Elite League of Women in Supply Chain 2022", date: "2022", region: "Global", industry: "Supply Chain", image: "/edition-aima-lodhi.png", coverLabel: "Supply Chain", coverName: "Aima Lodhi", description: "Championing innovation, collaboration, and resilience across global supply chains.", featured: false },
  { id: "edition-mohammed-abbas", title: "Middle East’s Most Inspiring CEOs to Watch in 2022", date: "2022", region: "Middle East & Africa", industry: "Leadership", image: "/edition-mohammed-abbas.png", coverLabel: "Leadership", coverName: "Mohammed Abbas", description: "Featuring Mohammed Abbas in a special edition on inspiring CEOs in the Middle East.", featured: false },
  { id: "edition-rolld-vietnamese", title: "Rôll’d Vietnamese: Sharing the Love of Vietnamese Cuisine", date: "2022", region: "Asia Pacific", industry: "Food & Hospitality", image: "/edition-rolld-vietnamese.png", coverLabel: "Food & Hospitality", coverName: "Bao Hoang and team", description: "A fast-food franchise sharing the love of Vietnamese cuisine, featuring the Rôll’d team.", featured: false },
  { id: "edition-rees-johnson", title: "The Most Eminent Leaders in Cybersecurity, 2022", date: "2022", region: "Global", industry: "Cybersecurity", image: "/edition-rees-johnson.png", coverLabel: "Cybersecurity", coverName: "Rees Johnson", description: "A technology enthusiast focused on empowering customers and ensuring their success.", featured: false },
  { id: "edition-paul-zikopoulos", title: "The 10 Most Influential Leaders in Data Science & Analytics 2023", date: "2023", region: "Global", industry: "Data Science", image: "/edition-paul-zikopoulos.png", coverLabel: "Data Science", coverName: "Paul Zikopoulos", description: "Featuring Paul Zikopoulos in an edition dedicated to influential leaders in data science and analytics.", featured: false },
]

export function issueReaderHref(issue: Pick<Issue, 'id'>) {
  return `/read/${encodeURIComponent(issue.id)}`
}

export function IssueCover({ issue, className = '', priority = false }: { issue: Issue; className?: string; priority?: boolean }) {
  return (
    <div className={`cover-art cover-art-authentic ${className}`} role="img" aria-label={`Magazine cover: ${issue.title}`}>
      <Image src={issue.image} alt="" fill priority={priority} sizes="(max-width: 640px) 45vw, 300px" />

    </div>
  )
}
