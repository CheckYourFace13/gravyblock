# Integrations

GravyBlock now ships with a **real functional scan core** plus extension points.

| Module | Purpose | Status |
| --- | --- | --- |
| `src/lib/integrations/google-places.ts` | Public business lookup + place details | **Live** (requires `GOOGLE_PLACES_API_KEY`) |
| `src/lib/integrations/google-search-console.ts` | Verified search performance | **Live if token/property provided** |
| `src/lib/integrations/google-business-profile.ts` | Owner-authorized enrichment | Stub (intentional) |
| `src/lib/integrations/resend.ts` | Lead notifications + confirmations | **Live** (env-gated) |
| `src/lib/audit/site-crawl.ts` | Technical + conversion crawl findings | **Live** |
| `src/lib/ranking/local-rank-estimator.ts` | Estimated local rank checks | **Live (estimated model)** |

## Source attribution model in reports

Every report stores source attribution labels:

- `google_places` (verified)
- `site_crawl` (verified)
- `google_search_console` (verified when connected)
- `estimated_local_rank` (estimated)
- `google_business_profile` (owner-only / usually not used)

## Jobs queue

Autopilot queue scaffolding now persists to:

- `jobs` (generic background jobs)
- `content_queue` + `publishing_jobs` (content generation/publishing)
- `backlink_opportunities` (authority workflows)
- `ai_visibility_checks` (LLM visibility probes)
- `operator_tasks` (managed execution queue)

Runtime workers/cron are still pending; queue states are persisted and surfaced in workspace/admin.

## Workspace URLs

`/workspace/[businessId]` is **unlisted** (UUID). Treat as sensitive; add auth + magic links before exposing to
untrusted users.

## Plan gating

`planFeatures()` in `src/lib/plans.ts` maps `businesses.plan_tier` to feature flags. Toggle tiers in admin / SQL to
exercise Pro vs Managed UI states.

## Setup checklist

1. Enable **Places API** in Google Cloud.
2. Set `GOOGLE_PLACES_API_KEY` in env.
3. (Optional) Set `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN`.
4. Run `npm run db:push`.
5. Start app and run scan from `/scan`.
6. Optional: configure Resend vars and submit lead forms from scan/report/site/workspace.
