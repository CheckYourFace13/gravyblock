# GravyBlock Full Handoff for Claude

## 1. Executive Summary

### Confirmed from repo
GravyBlock is a Next.js web app for local-business growth operations. It helps business owners run a local visibility scan, get a scored report with prioritized fixes, unlock the full report via email, and then manage ongoing growth work in a workspace with automation queues.

What it solves:
- Local businesses struggle to understand why they are not converting from local/near-me discovery.
- GravyBlock combines Google listing data, website crawl signals, and estimated/verified visibility data into a structured report and follow-up work queues.

Who it is for:
- Local businesses broadly (home services, clinics, legal, gyms, salons, retail, hospitality).
- Multi-location brands and service-area businesses are explicitly represented in schema/content.

Main user flow:
1. Visitor lands on marketing site (`/`).
2. Runs scan (`/scan`) using Google Places lookup.
3. App generates report (`/report/[publicId]`) with score, verdict, sections, and fixes.
4. User unlocks full report via name/email; lead is stored and optional emails are sent.
5. User moves to workspace (`/workspace/[businessId]`) and can start Basic/Pro billing.
6. For subscribed businesses, recurring jobs generate snapshots/content/authority/outreach/publishing artifacts.

Monetization/payment structure visible in code:
- Plan tiers: `free`, `base` (displayed as Basic), `pro`, `managed`.
- Pricing in `src/lib/plans.ts`:
  - Basic monthly: 29.99 (launch 19.99)
  - Pro monthly: 59.99 (launch 39.99)
- Stripe Checkout is subscription mode; billing portal is supported.

Current positioning/tagline/messaging (examples from repo):
- `Autopilot growth for local and multi-location businesses` (metadata/title).
- `Turn local visibility into booked work.` (homepage hero).
- `Local growth autopilot` (homepage eyebrow).

---

## 2. Live Website / Production Info

### Confirmed from repo
- Production URL source: `NEXT_PUBLIC_SITE_URL` (used in metadata, Stripe success/cancel URL roots, auth links, report links).
- Hosting references:
  - Hostinger deployment doc: `DEPLOY_HOSTINGER.md`
  - Vercel setup doc: `docs/SETUP.md`
- Runtime model:
  - Standard Next runtime (`next start`)
  - No custom `server.js` found in repo.
- Deployment/platform references found:
  - Hostinger (deployment doc)
  - Vercel (setup doc)
  - Stripe (checkout + webhook)
  - Google APIs (Places/Search Console, GBP stub)
  - Resend (email)
  - GitHub remote in local git config
- Public/internal URLs referenced:
  - Health: `/api/health`
  - Stripe webhook: `/api/stripe/webhook`
  - Autopilot routes: `/api/autopilot/*`
  - Google Places routes: `/api/google/places/*`
  - Report route: `/report/[publicId]`
  - Workspace route: `/workspace/[businessId]`

### Manual Confirmation Needed
- Exact live domain (not hardcoded in repo; env-driven).
- Exact Hostinger app root path on server.
- Exact production folder path on Hostinger filesystem.
- Exact startup command currently configured in Hostinger panel.
- Exact Node version selected in Hostinger panel.
- Exact DNS/domain wiring and reverse proxy setup.

---

## 3. Local Computer / File Locations

### Confirmed from repo / current environment
- Local repo path in this session: `C:\Users\chris\Projects\GravyBlock` (user-provided/session context).
- Windows paths appear in docs/examples (Hostinger doc includes Windows-style command examples).
- `.env*` files are ignored by `.gitignore`; no committed `.env` or `.env.example` currently present in this repo snapshot.
- Local scripts/build folders:
  - `.next/` build output (ignored)
  - `scripts/` contains SQL/proof and PGlite scripts
  - `drizzle/` is configured output path for Drizzle migrations
  - `.pglite-data/` ignored local DB data dir
- Output/export folders:
  - `.next/` (Next build)
  - `/out` listed in `.gitignore` (not currently used in scripts)

### User-provided / needs confirmation
- GravyBlock is being worked on locally through Cursor on Chris’s Windows computer.
- Related business/app work often lives somewhere under:
  - `C:\Users\chris\OneDrive\Documents\Businesses\iScream Studio\`
  - or another Cursor-selected project folder.
- Claude should ask for the exact local GravyBlock repo path if not included in this document.

---

## 4. Repository / Git Setup

### Confirmed from repo
- Git repo: Yes.
- Current branch: `main`.
- Remote:
  - `origin https://github.com/CheckYourFace13/gravyblock.git` (fetch/push).
- Last commit:
  - `aa844a11 Use webpack build for Hostinger deployment`
- Working tree status:
  - Untracked: `.next.zip`
  - No staged/committed local code changes at capture time.
- `.gitignore` notable entries:
  - `/.next/`, `/out/`, `/build`, `.env*`, `.pglite-data/`, `.postgres-real/`, `node_modules`.

Deploy style inference:
- Supports git-based deploy (remote exists).
- Also supports manual/VPS style deploy from docs (Hostinger + PM2/systemd guidance).

---

## 5. Tech Stack

### Confirmed from repo
- Framework: Next.js App Router (`src/app`).
- Language: TypeScript.
- UI: React + Tailwind CSS.
- Package manager: npm (`package-lock.json` present).
- Next.js version: `16.2.4`.
- React version: `19.2.4`.
- TypeScript: `^5`.
- ORM/DB: Drizzle ORM + Postgres (`drizzle-orm`, `postgres`, `drizzle-kit`).
- DB fallback: In-memory store (`src/lib/db/memory-store.ts`) for non-production/missing DB.
- Auth:
  - Admin cookie auth (`ADMIN_PASSWORD`, `ADMIN_SECRET`).
  - Customer magic-link auth (`customer_magic_links`, `customer_sessions`, secure cookie).
- Payments: Stripe subscriptions + webhook + portal.
- Email: Resend integration (`src/lib/integrations/resend.ts`).
- Maps/Places: Google Places API integration.
- Search data: Google Search Console token-based integration.
- AI/OpenAI/Claude integrations:
  - No OpenAI SDK, Anthropic SDK, or Claude API usage found in repo runtime code.
  - AI visibility in app uses internal synthetic/heuristic checks and queueing logic.
- Scheduler/queue/job system:
  - DB-backed `jobs` + autopilot routes.
  - Auth-protected automation POST endpoints.

Not found in repo:
- Firebase runtime integration.
- Supabase.
- Prisma.
- Redis/queue broker.
- Sentry/Datadog analytics SDK.
- Custom `src/server` runtime folder.

---

## 6. Install / Build / Run Commands

### From `package.json`
- Install: `npm install` (docs also mention `npm ci` for deploy).
- Dev: `npm run dev`
- Build: `npm run build` (`next build --webpack`)
- Start: `npm run start` (`next start`)
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- DB server helper: `npm run db:server`
- DB generate: `npm run db:generate`
- DB push: `npm run db:push`
- DB studio: `npm run db:studio`

### Additional scripts
- `node scripts/sql-query.mjs "<sql>"`
- `node scripts/proof-query.mjs <businessId> <brandId> <organizationId>`

### Deploy docs commands
- Hostinger: `npm ci` -> `npm run db:push` -> `npm run build` -> `npm run start`
- Cron call example for recurring jobs: POST `/api/autopilot/run-recurring` with secret header.

---

## 7. Environment Variables

No committed `.env.example` file found in repo snapshot. Variables below are extracted from code/docs.

### App/site and build
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Yes in prod | Canonical site URL, metadata base, Stripe URLs, links | `src/app/layout.tsx`, `src/lib/stripe/server.ts`, report/auth libs | `https://your-domain.com` |
| `NEXT_PUBLIC_APP_BUILD` | Optional | Build metadata display | `src/lib/build-metadata.ts` | `2026-04-25` |
| `GIT_SHA` | Optional | Build metadata | `src/lib/build-metadata.ts` | commit sha |
| `DEPLOYED_AT` | Optional | Build metadata | `src/lib/build-metadata.ts` | ISO timestamp |
| `NODE_ENV` | Yes in prod | Production guards/cookies/autopilot auth behavior | multiple | `production` |
| `PORT` | Host-managed | Next runtime port | deployment docs | `3000` |

### Database
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `DATABASE_URL` | Yes in prod | Postgres connection for app + Drizzle | `src/lib/db/index.ts`, `drizzle.config.ts` | `postgresql://user:pass@host:5432/db` |
| `DB_POOL_MAX` | Optional | Postgres pool max | `src/lib/db/index.ts` | `5` |
| `PGLITE_PORT` | Optional (local helper) | PGlite server port | `scripts/start-pglite-server.mjs` | `5432` |
| `PGLITE_DATA_DIR` | Optional (local helper) | PGlite data directory | `scripts/start-pglite-server.mjs` | `.pglite-data` |

### Auth
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `ADMIN_PASSWORD` | Yes in prod | Admin login password check | `src/lib/auth/admin-session.ts`, `src/app/actions/admin-login.ts` | strong password |
| `ADMIN_SECRET` | Yes in prod | Admin session signing; customer fallback secret | `src/lib/auth/admin-session.ts`, `src/lib/auth/customer-auth.ts` | long random string |
| `CUSTOMER_AUTH_SECRET` | Recommended/required in prod | Customer session/magic link signing | `src/lib/auth/customer-auth.ts` | long random string |
| `REPORT_UNLOCK_SECRET` | Optional/recommended | Report unlock token signing | `src/lib/report/unlock-token.ts` | long random string |
| `NEXTAUTH_SECRET` | Optional fallback | Report unlock fallback secret | `src/lib/report/unlock-token.ts` | long random string |

### Email
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `RESEND_API_KEY` | Optional | Send lead/report/login/outreach emails | `src/lib/integrations/resend.ts` | `re_...` |
| `RESEND_FROM_EMAIL` | Optional | Sender address for Resend | `src/lib/integrations/resend.ts` | `noreply@domain.com` |
| `LEAD_NOTIFICATION_EMAIL` | Optional | Internal lead inbox | `src/lib/integrations/resend.ts` | `ops@domain.com` |
| `RESEND_SEND_CONFIRMATION_TO_LEAD` | Optional | Toggle lead confirmations | `src/lib/integrations/resend.ts` | `true`/`false` |

### Stripe/payments
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | Yes for payments | Stripe server client | `src/lib/stripe/server.ts` | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Yes for webhook | Verify webhook signatures | `src/lib/stripe/server.ts`, webhook route | `whsec_...` |
| `STRIPE_PRICE_BASE_MONTHLY` | Yes for Basic plan | Checkout line item mapping | `src/lib/stripe/server.ts` | `price_...` |
| `STRIPE_PRICE_ENTRY_MONTHLY` | Legacy optional | Base fallback price ID | `src/lib/stripe/server.ts` | `price_...` |
| `STRIPE_PRICE_PRO_MONTHLY` | Yes for Pro plan | Checkout mapping | `src/lib/stripe/server.ts` | `price_...` |

### Google APIs
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `GOOGLE_PLACES_API_KEY` | Yes for scan | Place search/details/rank estimator inputs | `src/lib/integrations/google-places.ts` | API key |
| `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN` | Optional | Search Console metrics | `src/lib/integrations/google-search-console.ts` | OAuth bearer token |
| `GOOGLE_OAUTH_CLIENT_ID` | Optional placeholder | Future owner OAuth flow | docs/README only | OAuth client id |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Optional placeholder | Future owner OAuth flow | docs/README only | OAuth secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Optional placeholder | Future owner OAuth flow | docs/README only | URL |

### Cron/security/autopilot
| Variable | Required | Usage | Referenced in | Example format |
|---|---|---|---|---|
| `AUTOPILOT_OPERATOR_SECRET` | Yes in prod for POST ops routes | Protects `/api/autopilot/*` POST endpoints | `src/lib/autopilot/operator-auth.ts` | long random token |
| `AUTOMATION_ALERT_EMAIL` | Optional placeholder | Future failure alerts | docs/README only | email |
| `CMS_PUBLISHER_MODE` | Optional placeholder | Future publishing adapter mode | docs/README only | `manual`/`assisted`/`autopublish` |
| `CMS_WEBHOOK_SECRET` | Optional placeholder | Future CMS webhook signing | docs/README only | secret |

Secrets status:
- No real secrets were exposed in committed files inspected.
- If local secrets exist in untracked `.env` files, they are not in repo and should remain `[REDACTED]`.

---

## 8. File / Folder Map

### Root
- `package.json` / `package-lock.json`: scripts, dependencies.
- `README.md`: architecture and quickstart.
- `DEPLOY_HOSTINGER.md`: Hostinger deployment/runtime guidance.
- `docs/SETUP.md`: env + setup notes.
- `docs/INTEGRATIONS.md`: integration status.
- `docs/AUTOPILOT_ARCHITECTURE.md`: autopilot model notes.
- `drizzle.config.ts`: Drizzle schema output and DB URL.
- `next.config.ts`: minimal Next config.
- `docker-compose.yml`: local Postgres service.
- `scripts/*`: SQL/PGlite/proof helpers.

### `src/app`
- App Router entrypoint with public site, admin, API handlers, auth, workspace, report pages.
- Key API route handlers:
  - `src/app/api/google/places/search/route.ts`
  - `src/app/api/google/places/details/route.ts`
  - `src/app/api/stripe/webhook/route.ts`
  - `src/app/api/autopilot/*/route.ts`
  - `src/app/api/health/route.ts`
  - `src/app/api/proof/*/route.ts`

### `src/components`
- UI building blocks for header/footer, report rendering/unlock, scan form, admin nav, lead forms, roadmap, SEO page shell.

### `src/lib`
- `auth/*`: admin session and customer magic-link/session access control.
- `db/*`: schema, db client, memory fallback.
- `report/*`: report generation/types/repository.
- `integrations/*`: Google Places/Search Console/GBP stub/Resend.
- `billing/*`: Stripe event handling and persistence helpers.
- `autopilot/*`: recurring executor, workspace repo, operator auth.
- `plans.ts`: feature gating + pricing metadata.
- `growth/*`: roadmap/content-opportunity derivation.

### Not found in repo
- `src/server`
- `src/styles` (global styles are in `src/app/globals.css`)
- `prisma`
- `middleware` file
- `sitemap`/`robots` route files

### `public`
- Brand assets (`/public/brand/logo.png`, `/public/brand/og.png`, `/public/brand/favicon.png`)
- Icons (`favicon.ico`, `icon.png`, `apple-icon.png`)
- OG/Twitter images (`opengraph-image.png`, `twitter-image.png`)

---

## 9. Website Pages and Routes

### Public marketing/content routes (examples)
- `/` -> `src/app/(site)/page.tsx` (homepage, pricing, FAQ, links)
- `/scan` -> `src/app/(site)/scan/page.tsx` (scan start)
- `/report/[publicId]` -> report view/unlock
- `/guides`, `/guides/[slug]`, `/compare`, `/compare/[slug]`, `/examples`, `/examples/[slug]`
- `/industries`, `/industries/[slug]`
- Vertical pages: `/for-bars`, `/for-restaurants`, `/for-breweries`
- `/published/[id]` -> public internal published-content page

### Auth/customer routes
- `/login` -> customer magic-link request
- `/login/check-email`
- `/login/verify`
- `/app` -> customer dashboard (requires session)
- `/workspace/[businessId]` -> customer workspace (requires business access)
- `/workspace/[businessId]/billing/success`
- `/workspace/[businessId]/billing/cancel`

### Admin/private routes
- `/admin/login`
- `/admin` (dashboard; requires admin cookie)
- `/admin/autopilot`
- `/admin/businesses`, `/admin/businesses/[id]`
- `/admin/brands`, `/admin/brands/[id]`
- `/admin/locations`
- `/admin/reports`, `/admin/reports/[publicId]`
- `/admin/leads`

### API routes
- `POST /api/google/places/search`
- `POST /api/google/places/details`
- `GET /api/health`
- `POST /api/stripe/webhook`
- `POST /api/autopilot/run-recurring`
- `POST /api/autopilot/schedule-recurring`
- `POST /api/autopilot/execute-content`
- `POST /api/autopilot/prove-failure`
- `GET /api/proof/persistence`
- `POST /api/proof/seed-system`

### Error/not-found
- `/_not-found` runtime page generated by Next.
- `src/app/not-found.tsx` custom not-found component.

### SEO/indexing status
- Metadata and OG/Twitter configured globally in `src/app/layout.tsx`.
- FAQ JSON-LD embedded on homepage.
- No explicit `robots.ts` or `sitemap.ts` route found.

---

## 10. Main User Flow

### Confirmed from repo
1. User opens homepage and clicks into `/scan`.
2. Scan form calls `POST /api/google/places/search`, user selects candidate.
3. `generateReportAction` server action validates input and runs `generateReportFromPlace`.
4. Data sources used:
   - Google Place details
   - Website crawl audit
   - Search Console metrics (if token+property provided)
   - Estimated local ranking model
5. `recordScanRun` persists business, scan, report, rankings, findings, recommendations, content opportunities, queue seeds.
6. User is redirected to `/report/[publicId]` and sees free preview.
7. Report unlock form submits name/email -> lead stored -> unlock token URL issued.
8. If continuing, user enters workspace/billing and can start Basic/Pro via Stripe.
9. After subscription webhook updates plan state and schedules recurring automation jobs.
10. Workspace/admin surfaces ongoing automation outputs and statuses.

### Sample report context from repo
- `src/app/api/proof/seed-system/route.ts` includes synthetic report payload generation.
- `src/lib/report/generator.ts` sets:
  - `brand: "GravyBlock"`
  - score/verdict/title structure
  - business fields: name/address/website/phone/rating/reviewCount/maps URI
  - sections + prioritized fixes + source attribution.

---

## 11. Data Model / Database

### Confirmed from repo
- ORM: Drizzle ORM.
- DB provider: Postgres via `postgres` client.
- Schema file: `src/lib/db/schema.ts`.
- Migrations output folder configured: `drizzle/`.
- DB fallback: `memory-store` for non-prod if no DB URL.

### Core entities
- Account hierarchy: `organizations`, `brands`, `locations`, `businesses`, `website_domains`.
- Scan/report: `scans`, `place_profiles`, `social_profiles`, `reports`, `visibility_snapshots`, `ranking_checks`, `audit_findings`, `competitor_snapshots`.
- Growth execution: `recommendations`, `content_opportunities`, `growth_programs`, `content_strategies`, `content_queue`, `publishing_targets`, `publishing_jobs`, `published_content`, `backlink_opportunities`, `authority_campaigns`, `ai_visibility_checks`, `citation_monitors`, `operator_tasks`, `operator_notes`, `jobs`.
- Leads/auth: `leads`, `customer_magic_links`, `customer_sessions`.

Relationships:
- Most rows key back to `businesses.id`.
- Reports are unique per scan (`reports.scan_id unique`).
- Queue/job items linked to content/business as applicable.

Seed/proof:
- No generic production seed script.
- Proof seeding endpoint exists: `POST /api/proof/seed-system`.

---

## 12. APIs and Backend Logic

### API endpoints (confirmed)

1. `GET /api/health`
- File: `src/app/api/health/route.ts`
- Input: none
- Output: `{ ok, appName, environment, databaseConfigured, gitSha, buildVersion, deployedAt }`
- Auth: none

2. `POST /api/google/places/search`
- File: `src/app/api/google/places/search/route.ts`
- Input: validated by `placeSearchSchema` (`query`, `locationHint`)
- Output: `{ candidates }` or 400/500 error
- External: Google Places Text Search
- Auth: none

3. `POST /api/google/places/details`
- File: `src/app/api/google/places/details/route.ts`
- Input: `{ placeId }`
- Output: `{ details }` or error
- External: Google Place Details
- Auth: none

4. `POST /api/stripe/webhook`
- File: `src/app/api/stripe/webhook/route.ts`
- Input: Stripe event + `stripe-signature`
- Output: `{ received: true }` or error
- External: Stripe webhook verification and handlers
- Auth: Stripe signature required

5. `POST /api/autopilot/run-recurring`
- File: `src/app/api/autopilot/run-recurring/route.ts`
- Input: `{ limit? }`
- Output: recurring job processing result
- Auth: `AUTOPILOT_OPERATOR_SECRET` in production (`Authorization: Bearer` or `x-gravyblock-automation-secret`)

6. `POST /api/autopilot/schedule-recurring`
- File: `src/app/api/autopilot/schedule-recurring/route.ts`
- Input: `{ businessId, runAfterMs?, planTier? }`
- Output: schedule result
- Auth: operator secret in production

7. `POST /api/autopilot/execute-content`
- File: `src/app/api/autopilot/execute-content/route.ts`
- Input: `{ businessId }`
- Output: publish-path execution result
- Auth: operator secret in production

8. `POST /api/autopilot/prove-failure`
- File: `src/app/api/autopilot/prove-failure/route.ts`
- Input: `{ businessId }`
- Output: forced-failure proof object
- Auth: operator secret in production

9. `GET /api/proof/persistence`
- File: `src/app/api/proof/persistence/route.ts`
- Input: optional query params (`businessId`, `brandId`, `organizationId`)
- Output: structured DB rows for proof/inspection
- Auth: none in file (manual restriction recommended before production)

10. `POST /api/proof/seed-system`
- File: `src/app/api/proof/seed-system/route.ts`
- Input: none
- Output: seeded ids/publicIds
- Auth: none in file (manual restriction recommended before production)

### Server actions (non-HTTP API but backend logic)
- `src/app/actions/report.ts` (scan->report generation and redirect)
- `src/app/actions/report-unlock.ts` (unlock + lead + report email)
- `src/app/actions/lead.ts` (general lead capture)
- `src/app/actions/admin-login.ts` (admin login/logout)
- `src/app/actions/customer-login.ts` (magic-link request/logout)
- `src/app/(site)/workspace/[businessId]/billing-actions.ts` (Stripe checkout/portal actions)

---

## 13. External Services / Integrations

### Stripe
- Use: subscriptions, billing portal, webhook plan state sync.
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price env vars.
- Files: `src/lib/stripe/server.ts`, `src/app/(site)/workspace/[businessId]/billing-actions.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/billing/*`.
- Setup status: implemented in code; live credentials/price IDs require env confirmation.

### Google Places
- Use: business lookup and place details in scans.
- Env: `GOOGLE_PLACES_API_KEY`.
- Files: `src/lib/integrations/google-places.ts`, API routes under `/api/google/places/*`.
- Setup status: implemented.

### Google Search Console
- Use: optional verified search metrics.
- Env: `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN`.
- Files: `src/lib/integrations/google-search-console.ts`.
- Setup status: token/property based, optional.

### Google Business Profile
- Use: future owner enrichment.
- File: `src/lib/integrations/google-business-profile.ts`.
- Setup status: stub only.

### Resend
- Use: lead notifications, report delivery, magic-link email, automation summary, outreach sends.
- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `LEAD_NOTIFICATION_EMAIL`, optional confirmation toggle.
- Files: `src/lib/integrations/resend.ts`.
- Setup status: env-gated; implemented.

### Hostinger/Vercel/GitHub
- Hostinger and Vercel documented in markdown docs.
- GitHub remote configured locally.

### Not found in repo
- Firebase runtime integration.
- OpenAI/Anthropic API integration.
- Analytics provider SDK.

---

## 14. Stripe / Payment Setup

### Confirmed from repo
- Stripe package installed.
- Checkout implemented as subscription sessions in server action.
- Billing portal implemented.
- Price env mapping:
  - Basic: `STRIPE_PRICE_BASE_MONTHLY` (fallback legacy `STRIPE_PRICE_ENTRY_MONTHLY`)
  - Pro: `STRIPE_PRICE_PRO_MONTHLY`
- Webhook route: `POST /api/stripe/webhook`.
- Handled events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.paid`
  - `invoice.payment_failed`
- Success/cancel URLs:
  - `/workspace/[businessId]/billing/success`
  - `/workspace/[businessId]/billing/cancel`
- Customer model:
  - Stripe customer created if absent.
  - IDs persisted on business record.
- Subscription state updates:
  - `planTier`, `subscriptionStatus`, `currentPeriodEnd`, billing email.
- Promo codes:
  - `allow_promotion_codes: true` enabled in checkout.

### Not found in repo
- Statement descriptor customization.
- Connected accounts usage.
- Explicit product catalog provisioning scripts.

### Manual confirmation needed
- Stripe account ownership/legal entity (iScream Studio vs separate GravyBlock entity).
- Actual live Stripe products/prices in dashboard.
- Checkout branding and statement descriptor in Stripe dashboard.
- Whether live payments are currently enabled.

---

## 15. Admin / Internal Tools

### Confirmed from repo
- Admin auth protected by cookie session set after password check.
- Admin routes under `/admin/*` (except `/admin/login`) protected by layout guard.
- Admin pages include:
  - dashboard summary
  - reports list/detail
  - leads
  - businesses and business detail
  - brands and brand detail
  - locations
  - autopilot operations
- Tools include viewing:
  - report snapshots
  - lead pipelines/sources
  - business plans/subscription statuses
  - automation queues/jobs/content/publishing rows.

---

## 16. SEO / Marketing Setup

### Confirmed from repo
- Global metadata in `src/app/layout.tsx`:
  - title templates
  - description
  - Open Graph
  - Twitter card
  - icons
- Homepage includes FAQ section and FAQ JSON-LD (`FAQPage`).
- Content clusters:
  - industries
  - guides
  - compare pages
  - examples
- Vertical landing pages for bars/restaurants/breweries.

Not found:
- Explicit sitemap route.
- Explicit robots route.
- Canonical tags per-page beyond metadata base behavior.

### SEO improvements Claude should consider next
- Add `sitemap.ts` and `robots.ts`.
- Add page-level canonical/OG granularity for dynamic routes.
- Expand structured data (Organization/Product/Service/FAQ per route).
- Add stronger internal linking between guides/industries/examples.
- Add noindex guards for internal/proof endpoints if needed.

---

## 17. Branding / Assets

### Confirmed from repo
- Brand name: GravyBlock.
- Brand logo: `/public/brand/logo.png`.
- OG image: `/public/brand/og.png`.
- Favicon assets: `/public/favicon.ico`, `/public/brand/favicon.png`, `/public/apple-icon.png`, `/public/icon.png`.
- Brand voice examples:
  - “local growth autopilot”
  - “turn local visibility into booked work”
  - “score + verdict + prioritized fixes”

### Known context included
- Product is positioned as local-business growth/visibility/reporting software.
- Targets bars/restaurants/breweries plus broad local business categories.
- Focuses on near-me visibility and conversion-oriented recommendations/workflows.

---

## 18. Deployment Process

### Confirmed from repo
- Build artifact: `.next` expected for runtime.
- Build command: `npm run build`.
- Start command: `npm run start` (`next start`).
- `server.js`: Not found in repo.
- Hostinger Node app deployment explicitly documented.
- VPS fallback with PM2/systemd + Nginx documented.
- DB schema deployment step: `npm run db:push`.

Deploy mode possibilities indicated in repo:
- Git-based deployment (GitHub remote exists).
- Manual upload/SSH deployment (Hostinger docs and terminal workflows).

### Manual confirmation needed
- Hostinger app root.
- Startup file/command configured in panel.
- Production app URL/domain.
- Node version in production.
- Whether PM2/systemd is used.
- Whether deployment is Git pull, CI, or manual upload.

---

## 19. Testing / QA

### Commands run in this verification
- `npm run lint` -> Passed.
- `npm run typecheck` -> Passed.
- `npm run build` -> Passed (`next build --webpack`).

### Existing automated test setup
- No dedicated unit/integration test framework scripts found in `package.json`.
- Primary quality gates are lint/typecheck/build.

### Manual QA flows suggested by repo docs
- `/api/health` returns ok + DB configured state.
- `/scan` full scan path.
- `/report/[publicId]` unlock flow.
- `/admin/login` auth.
- Stripe checkout + webhook event handling.
- Autopilot POST routes with operator auth.

---

## 20. Current Known Issues / Gaps

### Confirmed from repo
- `.env.example` not found in current snapshot (README references it).
- Some docs mention scaffolding/future states that now partially diverge from implemented executor behavior.
- `api/proof/*` endpoints appear unprotected by auth in code; production exposure should be reviewed.
- Google Business Profile integration is stub only (owner auth not implemented).
- Search Console OAuth flow placeholders exist; current method is token env.
- `localhost` fallbacks appear in multiple server-side URL builders.
- Legacy “Base/Entry” terminology still appears in parts of UI copy/comments.
- No explicit rate limiting middleware found.
- No dedicated automated test suite found.

Search keyword results checked: TODO/FIXME/mock/demo/placeholder/hardcoded/localhost/example.com/test key.

---

## 21. Security / Privacy Notes

### Confirmed protections
- Stripe webhook signature verification enabled.
- Admin routes protected by session cookie + secret.
- Customer workspace routes protected by customer session/business access guard.
- Autopilot POST routes require shared secret in production.
- Cookies marked `httpOnly`, `sameSite=lax`, `secure` in production.
- Production guard prevents in-memory persistence when `DATABASE_URL` missing.

### Risks / review items
- `/api/proof/persistence` and `/api/proof/seed-system` should likely be restricted outside trusted environments.
- No explicit request rate limiting found for public routes (`/api/google/places/*`, lead/report unlock forms).
- Ensure production logs do not leak sensitive data from caught errors.
- Ensure secrets are only in env and never committed (currently `.env*` ignored).

---

## 22. Claude Action Plan

### Immediate Fixes
- Lock down proof endpoints (`/api/proof/*`) behind admin/operator auth or disable in prod.
- Finish Base->Basic naming consistency sweep in all remaining marketing/admin copy.
- Add committed `.env.example` with placeholders (no secrets).

### Before Launch
- Confirm all required env vars in production host panel.
- Verify Stripe webhook signing and event deliveries in live mode.
- Validate `DATABASE_URL` and run `npm run db:push` on production DB.
- Verify magic-link login and workspace authorization boundaries.

### Monetization / Stripe
- Confirm live price IDs map to intended products.
- Confirm checkout branding/statement descriptor.
- Confirm if owner-only promo codes are operationally managed in Stripe dashboard.

### SEO Improvements
- Add `robots.ts` and `sitemap.ts`.
- Expand route-level metadata and schema for dynamic routes.
- Add canonical strategy and index/noindex policy matrix.

### UX Improvements
- Normalize plan naming language (Basic/Pro) everywhere.
- Tighten CTA consistency across scan/report/workspace.
- Clarify “published where supported” statuses in UI copy.

### Backend / Data Improvements
- Add rate limits for public API and form submission paths.
- Add endpoint-level auth where needed for internal/debug routes.
- Add stronger typed response contracts and shared DTOs for APIs.

### Admin Improvements
- Add explicit filters for automation statuses and failures.
- Add audit trail for important admin/operator actions.
- Add role separation beyond single admin password model.

### Deployment Checklist
- Confirm app root, Node version, and startup command.
- Confirm build and start logs are healthy.
- Verify cron POST calls for recurring jobs include auth header.
- Verify DNS/HTTPS and `NEXT_PUBLIC_SITE_URL` alignment.

---

## 23. Unknowns Claude Should Ask Chris

- Exact live GravyBlock URL.
- Exact local Windows repo path currently in use.
- Exact GitHub repo policy/branch strategy for production.
- Exact Hostinger app root and startup configuration.
- Exact Stripe account/product/price setup and ownership.
- Whether GravyBlock is legally under iScream Studio.
- Whether live payments are already enabled.
- Whether current offer is free, freemium, or paid-first.
- Primary ICP priority: bars/restaurants/breweries only vs all local businesses.
- Whether Google Places API quotas/restrictions are fully configured.
- Whether Resend/email sending is enabled in production.
- Whether production DB is connected and migrated.
- Priority for Claude next: launch hardening, payments, SEO, report quality, or automation depth.

---

## 24. Appendix

### package.json
```json
{
  "name": "gravyblock",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint",
    "db:server": "node scripts/start-pglite-server.mjs",
    "db:generate": "drizzle-kit generate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@electric-sql/pglite": "^0.4.4",
    "@tailwindcss/postcss": "^4.2.4",
    "drizzle-orm": "^0.45.2",
    "nanoid": "^5.1.9",
    "next": "16.2.4",
    "pglite-server": "^0.1.5",
    "postgres": "^3.4.9",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "stripe": "^22.0.2",
    "zod": "^4.3.6"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "dotenv": "^17.4.2",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.4",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

### Important config summaries
- `drizzle.config.ts`: PostgreSQL dialect, schema at `src/lib/db/schema.ts`, output `drizzle/`.
- `next.config.ts`: minimal default config.
- `.gitignore`: ignores `.env*`, `.next`, local DB data dirs, node_modules.
- `docker-compose.yml`: local postgres service (`postgres:16-alpine`).

### API endpoint list
- See Section 12 for methods, files, inputs/outputs.

### Route list (from latest build)
- `/`, `/_not-found`
- `/admin`, `/admin/login`, `/admin/autopilot`, `/admin/brands`, `/admin/brands/[id]`, `/admin/businesses`, `/admin/businesses/[id]`, `/admin/leads`, `/admin/locations`, `/admin/reports`, `/admin/reports/[publicId]`
- `/api/autopilot/execute-content`, `/api/autopilot/prove-failure`, `/api/autopilot/run-recurring`, `/api/autopilot/schedule-recurring`
- `/api/google/places/details`, `/api/google/places/search`
- `/api/health`, `/api/proof/persistence`, `/api/proof/seed-system`, `/api/stripe/webhook`
- `/app`
- `/compare`, `/compare/[slug]`
- `/examples`, `/examples/[slug]`
- `/for-bars`, `/for-breweries`, `/for-restaurants`
- `/guides`, `/guides/[slug]`, `/guides/ai-search-local-businesses`, `/guides/multi-location-local-seo`, `/guides/service-area-business-visibility`, `/guides/social-proof-and-local-conversion`, `/guides/website-trust-signals`
- `/industries`, `/industries/[slug]`
- `/login`, `/login/check-email`, `/login/verify`
- `/published/[id]`
- `/report/[publicId]`
- `/scan`
- `/workspace/[businessId]`, `/workspace/[businessId]/billing/cancel`, `/workspace/[businessId]/billing/success`

### Data model summary
- See Section 11 for table groups and relationships.

### Commands run and results
- `git status --short` -> untracked `.next.zip`
- `git branch --show-current` -> `main`
- `git remote -v` -> `origin https://github.com/CheckYourFace13/gravyblock.git`
- `git log -1 --oneline` -> `aa844a11 Use webpack build for Hostinger deployment`
- `npm run lint` -> passed
- `npm run typecheck` -> passed
- `npm run build` -> passed

### Git status summary
- Branch `main`, up to date with origin.
- Untracked local file: `.next.zip`.

---

## Copy/Paste message for Chris to give Claude

Please read `GRAVYBLOCK_FULL_HANDOFF_FOR_CLAUDE.md` in the repo root first and treat it as the source of truth before making any changes. Then ask me any missing manual-confirmation items listed in Sections 2, 18, and 23 before editing production-critical billing/deployment/auth code.

