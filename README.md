# GravyBlock

GravyBlock is an autopilot growth platform for local businesses, multi-location brands, service-area operators, and online businesses building local trust: scan -> scored diagnosis -> execution queues -> recurring automation -> workspace tracking -> admin operations.

## Quick start

```bash
cp .env.example .env
# optional local database
docker compose up -d
npm install
npm run db:push
npm run dev
```

- Marketing site: `/`
- Free scan: `/scan`
- Admin: `/admin/login` (requires `ADMIN_PASSWORD` + `ADMIN_SECRET`)

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. If omitted, reports/leads persist **in memory** for the running dev server only. |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for metadata / Open Graph. |
| `ADMIN_PASSWORD` | Admin login password. |
| `ADMIN_SECRET` | HMAC salt for the admin session cookie. |
| `GOOGLE_PLACES_API_KEY` | Required. Powers business search, place details, and estimated local rank checks. |
| `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN` | Optional. Enables verified Search Console metrics when paired with a property URL in scan input. |
| `RESEND_API_KEY` | Optional. Enables lead emails through Resend. |
| `RESEND_FROM_EMAIL` | Sender used for lead email notifications/confirmations. |
| `LEAD_NOTIFICATION_EMAIL` | Internal inbox for new/updated lead notifications. |
| `RESEND_SEND_CONFIRMATION_TO_LEAD` | `true`/`false` toggle for lead confirmation emails. |
| `GOOGLE_OAUTH_CLIENT_ID` | Optional placeholder for future Search Console owner OAuth flow. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optional placeholder for future Search Console owner OAuth flow. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Optional OAuth callback URI placeholder. |
| `CMS_PUBLISHER_MODE` | Optional publishing mode (`manual`, `assisted`, `autopublish`). |
| `CMS_WEBHOOK_SECRET` | Optional signature key for future CMS publish adapters. |
| `AUTOMATION_ALERT_EMAIL` | Optional destination for automation failure alerts. |

## Architecture (high level)

- **Marketing routes** — `src/app/(site)/*` with shared chrome (`SiteHeader` / `SiteFooter`). Positioning: *Autopilot growth for local, multi-location, and locally-positioned online businesses*.
- **Report engine** — `src/lib/report/generator.ts` builds reports from Google Place details + crawl + ranking/search visibility layers.
- **Growth domain** — `src/lib/growth/roadmap.ts` (autopilot lanes), `content-opportunities.ts`, materialized into DB rows on each scan.
- **Workspace (autopilot ops)** — `/workspace/[businessId]` surfaces snapshots, roadmap, content queue, backlink queue, AI visibility probes, operator tasks, and automation job status.
- **Persistence** — `src/lib/db/schema.ts` defines core scan/report entities plus account/autopilot scaffolding: `organizations`, `brands`, `locations`, `website_domains`, `growth_programs`, `content_strategies`, `content_queue`, `publishing_targets`, `publishing_jobs`, `backlink_opportunities`, `authority_campaigns`, `ai_visibility_checks`, `citation_monitors`, `operator_tasks`, `jobs`, and `leads`.
- **Integrations** — `src/lib/integrations/google-places.ts`, `google-search-console.ts`, and `google-business-profile.ts` (owner-only stub) plus route handlers in `src/app/api/google/places/*`.
- **Plans / gating** — `src/lib/plans.ts` maps `plan_tier` → feature flags for future billing.
- **Server actions** — `src/app/actions/*` handle scan generation (with `redirect`), lead capture, and admin login/logout.

## Database

Drizzle Kit is configured in `drizzle.config.ts`. Common commands:

```bash
npm run db:push     # apply schema to DATABASE_URL
npm run db:studio   # optional data browser
```

## Real scan flow (Google-backed)

1. User enters business name + city/address on `/scan`.
2. App calls `POST /api/google/places/search` to fetch Google Place candidates.
3. User confirms the best match.
4. Server action runs full scan + autopilot seeding:
   - Google Place Details (verified)
   - Homepage crawl audit (verified)
   - Search Console metrics if connected (verified)
   - Local tracked-query ranking checks (estimated)
5. Report is stored with explicit source attribution and rendered at `/report/[publicId]`.
6. Scan submitter email is persisted as a deduplicated lead (`scan_form`) linked to business/report.
7. Autopilot tables are seeded with starter content, authority opportunities, AI checks, and operator tasks.

### Verified vs estimated in report

- **Verified:** `google_places`, `site_crawl`, `google_search_console` (when connected)
- **Estimated / monitored:** `estimated_local_rank`
- **Not used unless owner-connected:** `google_business_profile`

## Production setup docs

- Environment, Vercel, Resend, and Google API setup: `docs/SETUP.md`
- Integration status and source attribution details: `docs/INTEGRATIONS.md`
- Autopilot execution architecture: `docs/AUTOPILOT_ARCHITECTURE.md`

## Product documentation

See `DISCOVERY.md` for assumptions, blockers, and what could not be extracted from this workspace.
