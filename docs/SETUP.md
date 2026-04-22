# Production setup

## Environment variables

### Required

- `NEXT_PUBLIC_SITE_URL`
  - Used by: `src/app/layout.tsx` metadata/open graph URL base
  - Example: `https://app.gravyblock.com`
- `ADMIN_PASSWORD`
  - Used by: `src/lib/auth/admin-session.ts` admin login check
- `ADMIN_SECRET`
  - Used by: `src/lib/auth/admin-session.ts` session token signing
- `GOOGLE_PLACES_API_KEY`
  - Used by: `src/lib/integrations/google-places.ts`
  - Powers: place search, place details, local rank estimator

### Required for persistent production data

- `DATABASE_URL`
  - Used by: `src/lib/db/index.ts`
  - If missing, app falls back to in-memory storage (not production safe)

### Optional

- `DB_POOL_MAX`
  - Used by: `src/lib/db/index.ts` postgres pool sizing
- `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN`
  - Used by: `src/lib/integrations/google-search-console.ts`
  - Enables verified Search Console metrics in report generation
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
  - Reserved placeholders for future owner OAuth flow
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `LEAD_NOTIFICATION_EMAIL`
- `RESEND_SEND_CONFIRMATION_TO_LEAD`
  - Used by: `src/lib/integrations/resend.ts`
  - Enables internal lead alerts and optional lead confirmations
- `AUTOMATION_ALERT_EMAIL`
  - Placeholder target for future automation failure alerts (worker/cron path)
- `CMS_PUBLISHER_MODE`
  - Publishing posture (`manual`, `assisted`, `autopublish`) for future adapters
- `CMS_WEBHOOK_SECRET`
  - Placeholder signing secret for future CMS webhook callbacks

## Server/client boundary

- Variables prefixed with `NEXT_PUBLIC_` are client-visible.
- All secrets (`DATABASE_URL`, Google tokens, Resend keys, admin secrets) remain server-only and are only read from server actions/routes/libs.

## Vercel deployment steps

1. Create a Vercel project connected to this repository.
2. Add all required env vars in Vercel Project Settings -> Environment Variables.
3. Set build command: `npm run build`.
4. Set install command: `npm install`.
5. Configure a Postgres database and set `DATABASE_URL`.
6. After first deploy, run schema push once:
   - Local: `npm run db:push` against production `DATABASE_URL`, or
   - CI task before first traffic.
7. Verify:
   - `/scan` can search Google Places
   - `/report/[publicId]` renders
   - `/admin/login` works with configured password

## Resend setup

1. Create/verify a sending domain in Resend.
2. Set:
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL` (verified sender)
   - `LEAD_NOTIFICATION_EMAIL` (internal inbox)
3. Optional: set `RESEND_SEND_CONFIRMATION_TO_LEAD=false` to disable confirmation emails.
4. Submit a lead from:
   - `/scan` (scan form)
   - `/report/[publicId]` (report form)
   - homepage CTA forms
   - workspace upgrade form

## Google API setup

### Places API

1. In Google Cloud, enable Places API for your project.
2. Create an API key.
3. Restrict key by API and origin/IP as appropriate.
4. Set `GOOGLE_PLACES_API_KEY`.

### Search Console API

1. Enable Search Console API in the same or linked project.
2. For current token-based mode, set `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN`.
3. Enter a property URI when scanning (`sc-domain:example.com`).
4. Future owner OAuth flow will use:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI`

### Google Business Profile

- Public scan path intentionally does not use GBP.
- Future owner-authorized enrichment lives in `src/lib/integrations/google-business-profile.ts`.

## Background jobs / cron / PDF readiness

- `jobs` table plus `operator_tasks`, `content_queue`, `publishing_jobs`, `ai_visibility_checks`, and `backlink_opportunities` exist for recurring autopilot execution.
- No runtime worker/cron process is currently wired (tables and queue states are scaffolded).
- PDF export is not implemented yet; reports are HTML only today.
