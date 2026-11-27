-- The Visionary Voice initial PostgreSQL schema.
-- Safe to run more than once on a new or matching database.

CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  "image" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY,
  "expiresAt" timestamp NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamp,
  "refreshTokenExpiresAt" timestamp,
  "scope" text,
  "password" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "cms_pages" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "published" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "cms_pages_user_slug_unique" UNIQUE ("userId", "slug")
);
CREATE INDEX IF NOT EXISTS "cms_pages_published_slug_idx" ON "cms_pages" ("slug", "published");

CREATE TABLE IF NOT EXISTS "magazine_issues" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "articleText" text NOT NULL DEFAULT '',
  "industry" text NOT NULL DEFAULT '',
  "region" text NOT NULL DEFAULT '',
  "issueDate" date,
  "coverUrl" text,
  "fileUrl" text,
  "fileName" text NOT NULL DEFAULT '',
  "fileSize" bigint NOT NULL DEFAULT 0,
  "published" boolean NOT NULL DEFAULT false,
  "featured" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "magazine_issues_user_slug_unique" UNIQUE ("userId", "slug")
);
CREATE INDEX IF NOT EXISTS "magazine_issues_public_idx" ON "magazine_issues" ("published", "featured", "issueDate");
ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "articleText" text NOT NULL DEFAULT '';
ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "summary" text NOT NULL DEFAULT '';
ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "summaryStatus" text NOT NULL DEFAULT '';
ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "summaryModel" text NOT NULL DEFAULT '';
ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "pageImages" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "magazine_issues" ALTER COLUMN "fileUrl" DROP NOT NULL;
ALTER TABLE "magazine_issues" ALTER COLUMN "fileName" SET DEFAULT '';

CREATE TABLE IF NOT EXISTS "crm_contacts" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "company" text NOT NULL DEFAULT '',
  "title" text NOT NULL DEFAULT '',
  "phone" text NOT NULL DEFAULT '',
  "source" text NOT NULL DEFAULT 'website',
  "sourcePage" text NOT NULL DEFAULT '/',
  "referrerHost" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'new',
  "notes" text NOT NULL DEFAULT '',
  "emailConsent" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "crm_contacts_user_created_idx" ON "crm_contacts" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "crm_contacts_user_email_idx" ON "crm_contacts" ("userId", "email");

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "sessionHash" text NOT NULL,
  "eventType" text NOT NULL DEFAULT 'page_view',
  "pagePath" text NOT NULL,
  "referrerHost" text NOT NULL DEFAULT '',
  "utmSource" text NOT NULL DEFAULT '',
  "utmMedium" text NOT NULL DEFAULT '',
  "utmCampaign" text NOT NULL DEFAULT '',
  "deviceClass" text NOT NULL DEFAULT 'unknown',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "analytics_events_user_created_idx" ON "analytics_events" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "analytics_events_session_idx" ON "analytics_events" ("userId", "sessionHash", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text NOT NULL DEFAULT '',
  "content" text NOT NULL DEFAULT '',
  "author" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT '',
  "coverUrl" text,
  "published" boolean NOT NULL DEFAULT false,
  "publishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "slug")
);
CREATE INDEX IF NOT EXISTS "blog_posts_published_idx" ON "blog_posts" ("published", "publishedAt" DESC);

CREATE TABLE IF NOT EXISTS "newsletter_subscribers" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'subscribed',
  "sourcePage" text NOT NULL DEFAULT '/',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("userId", "email")
);
-- Newsletter sign-ups made before this table existed were saved as CRM contacts with email consent.
INSERT INTO "newsletter_subscribers" ("id", "userId", "email", "sourcePage", "createdAt", "updatedAt")
SELECT DISTINCT ON ("userId", lower("email")) gen_random_uuid()::text, "userId", lower("email"), "sourcePage", "createdAt", "createdAt"
FROM "crm_contacts"
WHERE "emailConsent" = true AND "source" = 'newsletter'
ORDER BY "userId", lower("email"), "createdAt"
ON CONFLICT ("userId", "email") DO NOTHING;

CREATE TABLE IF NOT EXISTS "newsletter_sends" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL,
  "kind" text NOT NULL,
  "itemId" text NOT NULL,
  "title" text NOT NULL,
  "recipients" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "sentAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "newsletter_sends_item_idx" ON "newsletter_sends" ("userId", "kind", "itemId", "sentAt" DESC);
