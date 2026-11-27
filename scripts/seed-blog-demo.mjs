import { randomUUID } from 'node:crypto'
import nextEnv from '@next/env'
import { Pool } from 'pg'

// Adds two published demo blog posts for the admin (ADMIN_EMAIL), so the blog is not empty.
// Safe to run more than once: posts whose address (slug) already exists are skipped.
// Run with: node scripts/seed-blog-demo.mjs
nextEnv.loadEnvConfig(process.cwd())

const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL
if (!adminEmail || !connectionString) {
  console.error('ADMIN_EMAIL and DATABASE_URL are required.')
  process.exit(1)
}

const day = 24 * 60 * 60 * 1000
const posts = [
  {
    slug: 'what-great-leaders-do-in-their-first-90-days',
    title: 'What great leaders do in their first 90 days',
    excerpt: 'The first three months in a new role set the tone for everything after. Here is what the leaders we interview do differently, and what they deliberately leave alone.',
    category: 'Leadership',
    author: 'The Visionary Voice Editors',
    coverUrl: '/cover-woman-red.png',
    publishedAt: new Date(Date.now() - 3 * day),
    content: `Ask any leader we have featured about their hardest stretch, and many point to the same moment: the first weeks in a new role. Expectations are high, information is thin, and every early decision is read as a signal.

Across dozens of conversations, a pattern keeps showing up. The strongest leaders treat their first 90 days less as a launch and more as an investigation.

## Listen before you fix

The temptation is to arrive with a plan. The leaders who last tend to arrive with questions instead. They meet people well beyond their direct reports, ask what is working and what should never change, and write down what they hear before acting on it.

> The fastest way to lose a team is to fix something they were proud of.

## Pick one early win, not ten

Momentum matters, but scattered quick wins rarely add up. Most of the leaders we spoke with chose a single, visible problem that the team already cared about, and solved it together. It builds trust faster than any all-hands speech.

- Choose a problem people already complain about
- Solve it with the team, not for them
- Say clearly what you learned along the way

## Make the next 90 days explicit

By the end of the first quarter, the best leaders share what they have learned and what comes next. That simple step turns quiet observation into a shared direction, and it gives everyone a reason to follow.

---

*Have a first-90-days story of your own? We would love to hear it for a future edition.*`,
  },
  {
    slug: 'inside-the-making-of-a-visionary-voice-edition',
    title: 'Inside the making of a Visionary Voice edition',
    excerpt: 'From the first interview to the final cover, a look at how each edition comes together, and why we spend more time listening than writing.',
    category: 'Behind the scenes',
    author: 'The Visionary Voice Editors',
    coverUrl: '/cover-man-blue.png',
    publishedAt: new Date(),
    content: `Every edition of The Visionary Voice starts the same way: with a conversation. Long before a cover is designed or a headline is written, our editors spend hours with the people we feature, trying to understand not only what they do, but how they think.

## It starts with a question

We rarely begin with a story in mind. Instead, we begin with a question we cannot answer yet. *How does a founder keep a company's culture as it grows from ten people to a thousand? What does resilience look like in a supply chain under pressure?* The edition grows out of the answers.

## From interview to article

A single profile can draw on several interviews, company material and the perspectives of colleagues and customers. Our editors then shape it into a piece that reads easily, keeps the subject's own voice, and leaves the reader with something to think about.

1. Research the person and the market they work in
2. Interview, then interview again
3. Write, edit and fact-check with the subject
4. Design the pages and the cover

## Why the cover matters

The cover is the first promise an edition makes. We choose a portrait that feels honest rather than staged, and pair it with a few words that capture the idea at the heart of the story.

> A good cover should make you curious, not tell you everything.

When an edition is ready, it joins the [magazine archive](/magazine), where readers can browse it as an article or turn its pages like a printed issue.`,
  },
]

const pool = new Pool({ connectionString, max: 1 })
try {
  const { rows } = await pool.query('SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1', [adminEmail])
  if (!rows[0]) throw new Error('The admin account does not exist yet. Sign up as the admin first.')
  const userId = rows[0].id
  for (const post of posts) {
    const result = await pool.query(
      `INSERT INTO "blog_posts" ("id", "userId", "title", "slug", "excerpt", "content", "author", "category", "coverUrl", "published", "publishedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $10, $10)
       ON CONFLICT ("userId", "slug") DO NOTHING`,
      [randomUUID(), userId, post.title, post.slug, post.excerpt, post.content, post.author, post.category, post.coverUrl, post.publishedAt],
    )
    console.log(result.rowCount ? `Added “${post.title}”.` : `Skipped “${post.title}” (already there).`)
  }
} catch (error) {
  console.error('Could not add the demo posts:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
