# GravyBlock

GravyBlock (https://gravyblock.com) is an autonomous local SEO platform for small businesses.
It learns the business from first-party facts, finds what would help, does the work on the
business's own website and Google profile, verifies the change is live, measures the result,
and keeps going. A free scan is the top of the funnel; paid plans run the autopilot.

Status as of 2026-09-27: in production, 0 paying subscribers. Owner house businesses run on
the platform as live canaries.

## Read these first (current docs)

| Doc | What it covers |
|---|---|
| `GRAVYBLOCK_FULL_HANDOFF_FOR_CLAUDE.md` (gitignored, lives only on Chris's machine) | Full handoff: production, deploy, stack, env, routes, billing, outreach, rules and gotchas |
| `docs/AUTOPILOT_ARCHITECTURE.md` | How the autonomous engine works (truth, queue, orchestrator, verification, proof, measurement) |
| `docs/orchestration-authority.md` | Every scheduled job and whether it may decide, observe, or only execute |
| `docs/site-connector-protocol.md` | How GravyBlock writes to customer sites (WordPress, Webflow, Shopify, managed feed) |
| `src/lib/capabilities.ts` | Canonical statement of what paid plans actually do. Public copy must match it |
| `src/lib/plans.ts` | Plan tiers, prices and feature gates |
| `AGENTS.md` | Next.js 16 has breaking changes; read `node_modules/next/dist/docs/` before writing Next code |

### Historical docs (do not trust for current behavior)

These describe earlier versions of the product or hosting and are kept only for history:
`DEPLOY_HOSTINGER.md`, `DEPLOY_VPS.md`, `DISCOVERY.md`, `docs/SETUP.md`, `docs/INTEGRATIONS.md`.
`docs/marketing-plan.md` (July 2026), `PRODUCT_HUNT_LAUNCH.md` and `docs/directory-listings.md`
are marketing material; check pricing and claims against `plans.ts` and `capabilities.ts` before
reusing any copy from them.

## Stack

Next.js 16.2 (App Router, webpack build) + React 19 + TypeScript + Tailwind 4, Drizzle ORM on
PostgreSQL, Stripe subscriptions, Resend email, Google Places / Search Console / Business
Profile, OpenRouter for all LLM calls. A separate long-running worker (`src/worker/index.ts`)
runs all scheduled automation. Hosted on a Hostinger VPS under PM2.

## Local development

```bash
cp .env.example .env.local   # then fill in real values; .env.example is incomplete, see the handoff doc
npm install
npm run db:server            # optional: local PGlite Postgres if you have no DATABASE_URL
npm run db:push              # apply src/lib/db/schema.ts to DATABASE_URL
npm run dev                  # web app on http://localhost:3000
npm run worker               # background worker (separate terminal)
```

Before pushing, always run:

```bash
npm run build
```

A failed build on the VPS strands the deploy (see the handoff doc). `npm run typecheck` and
`npm run lint` are also available. There is no automated test suite.

## Deploying

Push to `main`. The VPS polls GitHub every 2 minutes (`scripts/self-deploy.sh`) and deploys
new commits in about 4 to 6 minutes. Confirm with:

```bash
curl -s https://gravyblock.com/api/health
```

`gitSha` in the response is the live commit. GitHub Actions deploy is manual fallback only.

## Code map

| Path | Contents |
|---|---|
| `src/app/(site)/` | Public marketing site, free scan, reports, customer login, workspace |
| `src/app/admin/` | Owner admin (businesses, leads, outreach, MRR, autopilot, reports) |
| `src/app/api/` | Route handlers: Stripe/Resend webhooks, Places lookup, managed-site feed, health, events |
| `src/app/actions/` | Server actions: scan, lead capture, report unlock, customer and admin login |
| `src/worker/index.ts` | Scheduled automation (every 15 min tick, hour-gated batches) |
| `src/lib/opportunities/` | Growth opportunity queue, orchestrator, measurement, learning |
| `src/lib/truth/` | Business Truth layer |
| `src/lib/outreach/` | Cold outreach engine and its safety rails |
| `src/lib/db/schema.ts` | Database schema (Drizzle) |
