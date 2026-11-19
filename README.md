# The Visionary Voice

A responsive Next.js 16 publication website with a private administrator workspace.

## Public website

- Home, magazine archive, about, and digital issue reader pages
- Responsive editorial layout using the existing Instrument Serif / Inter typography and warm ivory / terracotta palette
- Newsletter capture with explicit email consent and honeypot protection
- Consent-based, pseudonymous page-view analytics

## Administrator workspace

- Visit `/sign-up` once to create the administrator account using the exact email configured in `ADMIN_EMAIL`
- Sign in at `/sign-in`; the protected workspace is at `/admin`
- CRM: search and filter contacts, update lead status and private notes, and export the contacts to CSV
- Magazine library: upload PDF issues and optional cover art, preview drafts, publish/unpublish, feature one issue, and delete issues
- Page editor: edit and publish the home, magazine, and about page copy
- Analytics: review consented page views, top pages, traffic sources, and device groups

All administrator actions are checked server-side against `ADMIN_EMAIL`. Uploaded magazine files are stored as private Vercel Blob objects and served through an access-controlled route.

## Required Vercel environment variables

Set these in the existing Vercel project for Production and Preview as appropriate:

- `DATABASE_URL` — PostgreSQL connection string
- `ADMIN_EMAIL` — the one email address allowed to register and administer the site
- `BETTER_AUTH_SECRET` — a long, random secret for Better Auth and analytics signing
- `BETTER_AUTH_URL` — canonical site URL, e.g. `https://your-domain.example`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token for private magazine uploads

Do not commit `.env` files or share secret values.

## Database setup

The initial schema is in `lib/db/migrations/0001_initial.sql`. With `DATABASE_URL` configured in your local environment, run:

```bash
pnpm install
pnpm db:migrate
pnpm build
```

The migration creates the Better Auth, CMS, magazine, CRM, and analytics tables and indexes. It is idempotent for a new database or a database with matching tables. If your existing database has older tables with different columns, take a backup and reconcile the schema before running it.

## Deployment

Deploy this project from the repository root to the existing Next.js Vercel project. Confirm the environment variables above are present before testing the admin flow. After deployment:

1. Run the database migration once against the production database.
2. Open `/sign-up` and register the configured `ADMIN_EMAIL`.
3. Sign in at `/sign-in` and verify `/admin`.
4. Test a newsletter signup, a small PDF upload, draft preview, publish/unpublish, and the public archive.
5. Accept analytics consent on the public website and confirm page views appear in the admin analytics panel.

The admin dashboard does not include sample/demo records; it displays records stored in the configured database.
