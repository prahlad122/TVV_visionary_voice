import { boolean, bigint, date, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

/** One pre-rendered page of an issue: its private R2 object key and pixel size. */
export type PageImage = { path: string; width: number; height: number }

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const cmsPages = pgTable('cms_pages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  content: jsonb('content').$type<Record<string, string>>().notNull().default({}),
  published: boolean('published').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique().on(table.userId, table.slug)])

export const magazineIssues = pgTable('magazine_issues', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  articleText: text('articleText').notNull().default(''),
  // Generated after the article text is saved. Status: '' (no text yet), 'pending', 'ready', 'failed'.
  summary: text('summary').notNull().default(''),
  summaryStatus: text('summaryStatus').notNull().default(''),
  /** Which model wrote the summary, e.g. "gemini-3.5-flash"; empty for the built-in fallback. */
  summaryModel: text('summaryModel').notNull().default(''),
  // Screen-resolution WebP image of every page, rendered at upload; the reader shows these instead of the PDF.
  pageImages: jsonb('pageImages').$type<PageImage[]>().notNull().default([]),
  industry: text('industry').notNull().default(''),
  region: text('region').notNull().default(''),
  issueDate: date('issueDate', { mode: 'string' }),
  coverUrl: text('coverUrl'),
  fileUrl: text('fileUrl'),
  fileName: text('fileName').notNull().default(''),
  fileSize: bigint('fileSize', { mode: 'number' }).notNull().default(0),
  published: boolean('published').notNull().default(false),
  featured: boolean('featured').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [unique().on(table.userId, table.slug)])

export const crmContacts = pgTable('crm_contacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company').notNull().default(''),
  title: text('title').notNull().default(''),
  phone: text('phone').notNull().default(''),
  source: text('source').notNull().default('website'),
  sourcePage: text('sourcePage').notNull().default('/'),
  referrerHost: text('referrerHost').notNull().default(''),
  status: text('status').notNull().default('new'),
  notes: text('notes').notNull().default(''),
  emailConsent: boolean('emailConsent').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const analyticsEvents = pgTable('analytics_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  sessionHash: text('sessionHash').notNull(),
  eventType: text('eventType').notNull().default('page_view'),
  pagePath: text('pagePath').notNull(),
  referrerHost: text('referrerHost').notNull().default(''),
  utmSource: text('utmSource').notNull().default(''),
  utmMedium: text('utmMedium').notNull().default(''),
  utmCampaign: text('utmCampaign').notNull().default(''),
  deviceClass: text('deviceClass').notNull().default('unknown'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
})
