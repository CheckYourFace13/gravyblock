# Marketing Studio: Phase 0 audit, architecture and implementation plan

Revision 3 (2026-10-31), FINAL: owner decisions recorded in sections 12 to 15 (Atlas permanently out of scope, VPS runtime, separate worker, $0 AI budget, pilots DrinkKnird / RentalNoodle / ScribbleZap, Phase 1 gated on GravyBlock recovery).

Revision 2 (2026-10-31): Atlas removed from the design (out of scope, no dependency); the VPS is the sole normal-operation runtime; Windows PC not part of the architecture; separate `gravyblock-marketing-worker` required; Phase 1 narrowed to a lightweight $0 foundation; Phase 2 starts with a mandatory VPS benchmark; 8 GB initial disk ceiling; one heavy render at a time.

Status: design only. No code, no migration, no table, no deploy, no connection to any platform. Audit date 2026-10-31, repository at production SHA `3dda12a`.

Source note: the directive refers to an attached "GRAVYBLOCK, MARKETING STUDIO Full Project Handoff & Implementation Directive". That file was not attached to the session and is not in the repository, so this plan follows the Phase 0 brief as pasted. Anything the handoff adds (templates, exact automation level wording) must be reconciled before Phase 1.

Facts marked VERIFY come from third-party summaries of platform rules, not from the platform's own current documentation, and must be re-checked against official docs before any build depends on them.

---

## 0. Findings that shape everything

1. **The VPS is small and shared.** 2 vCPU, 7.9 GB RAM (about 3.4 GB available, no swap), 96 GB disk at 80% (20 GB free), load average about 0.5. It already runs GravyBlock web and worker, several other Next apps, Postgres, Docker (about 880 MB resident), ClickHouse and others. A runaway video job with no memory cap can trigger the OOM killer against production. Isolation is mandatory, not optional.
2. **Tools already on the box:** ffmpeg and ffprobe with libx264, aac, libass and drawtext; Playwright Chromium builds in `/root/.cache/ms-playwright` (used by another system, not by GravyBlock); Node 20. Fonts are minimal (DejaVu, Liberation, Noto Color Emoji), so brand fonts must be bundled.
3. **The GravyBlock repo has no media stack.** No Playwright, no FFmpeg wrapper, no TTS. `sharp` exists only as a transitive dependency of Next and must be declared explicitly if used.
4. **No secret encryption exists.** OAuth tokens (`google_oauth_connections`, `search_console_property_connections`) and Facebook tokens (`business_configs.facebookAccessToken`) are stored as plaintext. Marketing Studio must not copy that pattern.
5. **Schema deploy is automatic.** `scripts/self-deploy.sh` runs `drizzle-kit push` on every deploy and `drizzle.config.ts` points at one schema file. Studio tables must be additive only and in their own schema file, and the config must be extended deliberately, or a Studio schema edit rides every GravyBlock deploy.
6. **Nothing can be built against production data until the Neon to VPS migration finishes.** After it, the database is local Postgres, which enables a stricter safeguard that Neon could not (section 4.3).
7. **Atlas: OUT OF SCOPE / NO DEPENDENCY.** Marketing Studio is implemented independently. No Atlas code, data, jobs, credentials, renderer, worker, scheduler, narration or caption service, and no fallback to Atlas. Nothing is audited or copied from it. FFmpeg composition, captions, narration, scheduling, job supervision and media validation are generic capabilities built cleanly inside Studio (sections 5, 7, 9).
8. **Runtime decision (revision 2): the GravyBlock VPS is the primary and only normal-operation runtime.** Studio runs unattended. Chris's Windows PC is not part of the production architecture: it need not be on, logged in, running Cursor, or running any render agent. If the VPS cannot carry the workload, the answer is a measured report and a separate decision, not an automatic move to the PC and not a purchase.

---

## 1. Reuse audit

Verdicts: AS-IS, WRAPPER, COPY (copy the idea or code into Studio, no runtime link), NO (do not reuse).

| System | Where | Verdict | Why |
|---|---|---|---|
| Admin auth and session | `src/lib/auth/admin-session.ts`, `admin-login-rate-limit.ts`, `src/app/admin/(dashboard)` | AS-IS | Phase 1 UI is admin-only. A new `/admin/marketing-studio` section reuses the existing guard and layout. No new auth. |
| Customer auth and guards | `customer-auth.ts`, `customer-guards.ts`, `/workspace/[businessId]` | WRAPPER (later) | Needed only for outside customers (Phase 4). Wrap the existing guard so a Studio route can only resolve products owned by the signed-in customer. |
| Tenant model | `organizations`, `brands`, `locations`, `businesses` | WRAPPER | Studio products are not all businesses (games and apps have no GBP, scans or place_id). Add `ms_products` with optional `business_id` FK and `organization_id`. Do not widen `businesses`. |
| House Accounts | `businesses.account_type='house'`, `src/lib/house`, `write-policy.ts` | AS-IS for classification, NO for logic | Reuse the classification to mark internal ownership. Do not import the house scheduler. Studio never needs site writes, so the guard is not extended, only respected (section 2). |
| Business Truth | `src/lib/truth` (`business_facts`, `truth_pages`, extractor, freshness, "no truth, no output") | COPY | The model fits (keyed facts, status current/superseded, source URL, hash, expiry) but the key set is local-business shaped (hours, services, address). Fork into Product Truth with game/app keys. Reuse `safeFetchText` and the conditional-request crawl pattern unchanged. |
| Safe fetch | `src/lib/net/safe-fetch.ts` | AS-IS | SSRF guard, size cap, timeout. Read-only import is safe. |
| AI provider | `src/lib/integrations/openrouter.ts` | WRAPPER | One key, fallback chain, models `llama-3.1-8b-instruct` plus `gpt-4o-mini` fallback. It has no usage accounting and no per-feature budget. Wrap it with a Studio gateway that records tokens and cost to `ms_usage`, enforces a monthly cap (default $0 means template-only mode), and refuses when capped. Note this is pay-per-token on the existing key (cents), not literally $0. Free `:free` models are in the fallback chain and can serve as the zero-cost mode. |
| `json-extract` | `src/lib/ai/json-extract.ts` | AS-IS | Parsing model JSON. |
| Jobs table | `jobs` (type, status, payload) | NO for the Studio queue | It is the shared event log for outreach counts, budgets, hold flags and admin settings; adding high-volume media jobs would pollute it and the budget queries that read it. Use dedicated `ms_media_jobs`. Pattern is copied (idempotency keys, `hasJobRunToday` style dedupe). |
| Worker | `src/worker/index.ts` (1,052 lines, one 30-minute tick, hour-gated batches, `guardedTick`) | NO | Section 5. Studio gets its own process. |
| Worker hold and migration watchdog | `ecosystem.config.js`, `/var/lib/gravyblock-migration/*` | NO (do not touch) | Studio must neither read nor depend on these. |
| DB load guard | `src/lib/db-guard.ts` | COPY | Same idea for Studio: skip optional work when DB load or host load is high. |
| Send budget and pause guard | `outreach/send-budget.ts`, `pause-guard.ts` | COPY | Great pattern: a single choke point at the send boundary that fails closed. Replicate as `assertPublishAllowed()` called immediately before every platform API call. Do not share the outreach pause switch or ceilings. |
| Admin pause/settings storage | `jobs` row `outreach_settings` | NO | Studio uses its own settings table (`ms_settings`) so Studio pause cannot be conflated with outreach pause. |
| Competitor monitoring | `competitors/gap-engine.ts`, `competitor_snapshots` | NO for v1 | Local-business competitors, not games. Later, optional read of public competitor pages for positioning. |
| AEO and AI visibility | `ai-visibility/*`, `llm-probes.ts`, `perplexity.ts` | NO | Different problem. Possible later use: probe whether an AI engine mentions a product. |
| Analytics | `funnel_events`, `src/lib/events/track.ts`, `attribution.ts` | WRAPPER | Use for GravyBlock's own campaigns (UTM attribution into the existing funnel). For other products, whose sites must stay untouched, read platform insights APIs and, optionally, GravyBlock-hosted redirect links (section 11). |
| Proof ledger | `proof_ledger`, `proof/levels.ts` | NO | Proof levels describe verified site changes. Studio results are a separate ledger. |
| Publishing concepts | `publishing_targets`, `publishing_jobs`, `published_content`, `site-publish/*`, adapters | NO | Entire stack is the website write path that the House guard polices. Reusing it would couple Studio to the exact code that must stay read-only for House sites. Copy only the lifecycle idea (queued, publishing, published, failed, verified). |
| Facebook poster | `social/facebook-poster.ts`, `integrations/facebook.ts` | COPY the Graph call code | Proves Page and Instagram posting is feasible. Do not copy token storage (plaintext in `business_configs`) or the paid-tier gating. |
| Reddit, Truth Social | `social/reddit-poster.ts`, `truth-social.ts` | NO | Reddit posting is disabled; neither is in scope. |
| Unsplash | `integrations/unsplash.ts` | NO | Studio uses owned assets only. |
| Stripe, entitlements | `stripe/*`, `entitlement.ts`, `plans.ts`, `capabilities.ts` | WRAPPER (Phase 4) | One public product at $39.99 is untouched. A future Studio entitlement is a separate flag read through `entitlement.ts`. Do not add Studio to `capabilities.ts` until it runs in production, because that file is the public-claims source of truth. |
| Feature flags | none (settings are ad hoc `jobs` rows and env vars) | NEW | `ms_settings` with an enabled flag and a kill switch (section 5). |
| Audit log | none general (`jobs` rows, `operator_notes`) | NEW | `ms_audit_events`, append-only. |
| Monitoring | `watchdog/*`, house watchdog, `/api/health`, nginx | WRAPPER | Studio heartbeat visible in admin; Studio failure must never turn `/api/health` red. |
| Retries and backoff | house `retryBackoffHours`, ad hoc | COPY | Standard exponential backoff with a retry cap and a dead-letter state per job. |
| DB layer | Drizzle + postgres.js, `getDb()` | WRAPPER | Studio gets its own connection pool with a small cap, and after migration its own Postgres role (section 4.3). |
| Playwright and FFmpeg | on VPS, not in repo | NEW dependency | Studio pins its own Playwright and ffmpeg path and does not share the other system's browser cache. |
| Media handling | none | NEW | `ms_*` media library, content-addressed files on local disk. |
| Unity and Android capture | not in repo | NEW, owner-provided | Real captures arrive as uploads (section 7). |

---

## 2. What must stay untouched

Hard rules, enforced by code review checks, not by convention:

| Component | Rule for Studio |
|---|---|
| Primary web request path | No Studio code in `middleware.ts`, layout, or any public route in Phases 1 to 3. Admin routes only. If a click-redirect route is ever added it must be a separate route, fail open, and never block rendering. |
| Autonomous growth engine (`opportunities/*`, `autopilot/*`, `growth/*`) | No imports in either direction. Studio does not enqueue into `growth_opportunities`. |
| House Account write guard (`site-publish/write-policy.ts`) | Unchanged. Studio never imports `site-publish`, `publishing/adapters`, `wordpress`, or anything that writes a site. A repository check (grep in CI or a pre-push script) fails if `src/lib/marketing-studio/**` imports those paths. |
| Outreach A/B and sends (`outreach/*`) | No shared pause, ceiling, jobs types or email sender. Studio never emails prospects. |
| Stripe funnel, acquisition reporting (`reporting/*`, `funnel_events`) | Read-only. Studio may read funnel events; it writes none except an optional distinct `source` value that is excluded from conversion math by default. |
| Migration watchdog, worker hold, DB config | Never read, edited or restarted by Studio. Studio's own process is not gated by the hold file (it should simply not start until the migration report exists, enforced by a pre-start check on a Studio flag you set). |
| Atlas | OUT OF SCOPE / NO DEPENDENCY. Not read, not copied, not called, not a fallback. |
| Customer SEO/AEO workflows | Untouched. |
| Public claims | `capabilities.ts` and public copy do not mention Studio until it is live. |

---

## 3. Module architecture

Additive module, one directory, one schema file, one worker entrypoint, one admin section.

```
src/lib/marketing-studio/
  products/        product + brand profile, owner scoping
  truth/           Product Truth: facts, claims, ingestion (public pages, store listings, owner input)
  media/           media library, content-addressed storage, provenance, cleanup
  creative/        template engine, renderers (HTML to PNG, SVG, sharp), aspect-ratio presets, QA
  video/           storyboard, script, capture ingest, FFmpeg assembly, captions, audio, QA
  campaigns/       campaigns, variants, hook generation, approval state machine
  publishing/      platform adapters (youtube, facebook, instagram, tiktok), publish gate, export bundles
  connections/     encrypted credential store, OAuth flows, health checks
  analytics/       platform insights pull, UTM, metrics rollups
  automation/      rules, automation levels, bounded-autopilot limits
  quality/         validators shared by creative and video (spelling, claims, numbers, safe zones)
  usage/           cost and usage accounting, budgets, caps
  runtime/         queue, job runner, resource governor, kill switch, heartbeat
src/lib/db/studio-schema.ts          (ms_* tables only)
src/worker/marketing.ts                 (own entrypoint, own PM2 app)
src/app/admin/(dashboard)/marketing-studio/...   (admin UI)
studio-assets/templates/             (versioned HTML/CSS/SVG templates and bundled fonts)
```

Boundaries (what each owns):

- **Product/Brand profile**: identity, kind (website, SaaS, app, game), owner scope, brand tokens (colors, fonts, logo asset ids), voice rules. No marketing content.
- **Product Truth**: the only source generators may read. Facts, approved claims, prohibited claims, canonical URLs, store listings, approved assets.
- **Campaigns**: objective, audience, channels, schedule window, variants, approval state.
- **Creative Studio**: deterministic template rendering to images at several aspect ratios.
- **Video Studio**: storyboard to captioned MP4 using only approved captures and graphics.
- **Media library**: uploaded and rendered files, hashes, provenance, retention.
- **Publishing/Scheduling**: adapters behind one interface, one publish gate, export bundles for manual platforms.
- **Platform connections**: credential references and health, never plaintext.
- **Analytics**: pulled metrics only, no invented numbers.
- **Automation rules**: levels 1 to 3 as data, plus hard caps.
- **Templates**: versioned files, not DB blobs; a template change is a reviewed commit.
- **Quality validation**: gate between "generated" and "approvable".
- **Cost/usage**: every model call and render recorded; caps enforced before the call.

Fit into GravyBlock: a new admin section and one new PM2 app. Existing product behavior is unchanged. The only shared code imported is read-only utilities (`safe-fetch`, `json-extract`, `getDb` connection config) and, for House or customer ownership flags, a read of `businesses`.

---

## 4. Database design (additive, not executed)

Conventions copied from the existing schema: `uuid` PKs via `defaultRandom()`, `timestamptz`, snake_case plural names, `text` enums with documented values, JSONB for payloads. Prefix `ms_` keeps drizzle-kit rename detection away from existing tables (every table is new, nothing is dropped).

### 4.1 Tables

| Table | Key columns | Notes |
|---|---|---|
| `ms_products` | id, owner_kind (`internal`/`house`/`customer`), organization_id, business_id (nullable FK `businesses`, set null), kind (`website`/`saas`/`mobile_app`/`web_game`/`mobile_game`), name, slug, status (`draft`/`active`/`paused`/`archived`), enrolled_at, enrolled_by, deleted_at | Nothing is auto-enrolled; a row exists only after an explicit admin action. |
| `ms_brand_profiles` | product_id, colors, font_ids, logo_asset_id, voice_rules, do_not_say, version | One current row per product, versioned. |
| `ms_product_facts` | product_id, fact_key, value, source_kind (`public_page`/`store_listing`/`owner_entered`/`asset_metadata`), source_url, content_hash, status (`current`/`superseded`/`expired`), verified_by, verified_at, expires_at | Mirrors `business_facts` semantics with Studio keys. |
| `ms_claims` | product_id, kind (`approved`/`prohibited`), text, fact_ids[], rationale, added_by | Approved claims must cite facts. Prohibited claims (for example "no ads", "free forever") are checked on every output. |
| `ms_assets` (brand_assets and media library) | owner_product_id, kind (`logo`/`screenshot`/`gameplay_capture`/`app_capture`/`icon`/`render_image`/`render_video`/`audio`/`font`), storage_path, sha256, bytes, width, height, duration_ms, provenance (`owner_upload`/`public_fetch`/`rendered`), source_asset_ids[], approved (bool), approved_by, license_note, expires_at | Only `approved` assets are usable as footage or imagery. Rendered output keeps its source ids so any clip can be traced to real footage. |
| `ms_campaigns` | product_id, name, objective, audience, channels[], window_start, window_end, status (`draft`/`generating`/`needs_review`/`approved`/`scheduled`/`live`/`complete`/`cancelled`), automation_level (1/2/3), created_by | |
| `ms_campaign_variants` | campaign_id, kind (`image`/`video`/`text`), hook, copy, fact_refs[], template_id, template_version, aspect_ratio, asset_id, qa_status, qa_report jsonb, approval_status, approved_by, approved_at | `fact_refs` is mandatory for any text containing a claim. |
| `ms_media_jobs` | id, product_id, campaign_variant_id, kind (`render_image`/`render_video`/`capture_ingest`/`tts`/`qa`), stage, status (`queued`/`running`/`done`/`failed`/`dead`/`cancelled`), priority, attempts, max_attempts, run_after, locked_by, locked_until, heartbeat_at, input jsonb, output jsonb, error, cpu_ms, wall_ms, tmp_dir | Resumable by stage, lock lease for crash recovery. |
| `ms_connections` (publishing_accounts) | product_id, platform, account_label, external_account_id, scopes, secret_ciphertext, key_id, token_expires_at, status (`connected`/`expired`/`revoked`/`error`), authorized_by, authorized_at, last_checked_at | No plaintext. Ciphertext plus a key id; the key lives only in the VPS env. |
| `ms_publish_jobs` | variant_id, connection_id, platform, mode (`export_only`/`draft`/`scheduled`/`direct`), scheduled_for, status, attempts, idempotency_key unique, approved_by, approved_at, request_digest | Publishing requires an approved variant and a human approval record at Levels 1 and 2. |
| `ms_publish_results` | publish_job_id, external_post_id, url, published_at, platform_status, error, raw_digest | |
| `ms_campaign_metrics` | variant_id, platform, captured_at, impressions, views, likes, comments, shares, clicks, watch_ms, source (`platform_api`/`redirect`), raw jsonb | Time series, only values returned by a platform or counted by us. |
| `ms_automation_rules` | product_id, level, enabled, max_posts_per_day, max_posts_per_week, allowed_platforms[], allowed_variant_kinds[], quiet_hours, requires_qa_score, pause_on_error_count, expires_at | Level 3 rules always carry caps and an expiry. |
| `ms_usage` | product_id, period, resource (`llm_tokens`/`llm_usd`/`cpu_seconds`/`render_seconds`/`disk_bytes`/`api_calls`), amount, cap, source_job_id | Cap checked before work starts. |
| `ms_settings` | key, value jsonb, updated_by | `enabled`, `kill_switch`, `render_window`, `max_concurrency`, `monthly_llm_usd_cap` (default 0). |
| `ms_audit_events` | actor, action, entity, entity_id, diff, at | Append-only; records every approval, enrollment, connection, publish and setting change. |
| `ms_templates` (optional) | slug, version, kind, content_hash | Registry pointing at files in the repo, to pin a version to each rendered variant. |

### 4.2 Requirements mapping

- **Tenant isolation**: every table carries `product_id`, and every repository function takes a required `OwnerScope` (internal admin, or a customer's `organization_id`/`business_id`) and adds it to the query, following `autopilot/repository.ts`.
- **House and internal ownership**: `owner_kind` plus an optional link to `businesses` for House sites. A House product row never grants write access to anything; Studio has no write path to sites.
- **Customer ownership**: `owner_kind='customer'` with `organization_id`; entitlements come from `entitlement.ts` later.
- **Deletion**: `deleted_at` soft delete, then a purge job removes rows and files, revokes tokens, and writes a final audit event. `ON DELETE CASCADE` from `ms_products` to dependent tables.
- **Credential references**: AES-256-GCM ciphertext with `key_id`; key in a Studio-only env var; never logged; admin UI shows only account label and status.
- **Auditability**: `ms_audit_events` plus immutable `qa_report` and `request_digest` on variants and publish jobs.
- **Future quotas**: `ms_usage` plus per-owner caps in `ms_settings`.

### 4.3 Stronger isolation after the migration (recommended)

Once GravyBlock runs on local Postgres, the Studio worker can connect as a dedicated role, `gb_studio`, with INSERT/UPDATE/DELETE only on `ms_*` tables and SELECT only on the few tables it needs (`businesses` id, name, website, account_type). Even a bug cannot then write to `businesses`, `business_facts`, `publishing_*` or the proof ledger. This is a defense-in-depth layer on top of the code-level rule and it costs nothing. It is not possible on the current Neon setup and must not be attempted before the migration report is final.

Schema deploy: put tables in `src/lib/db/studio-schema.ts` and extend `drizzle.config.ts` to an array of schema files only when Phase 1 starts. Tables are new, so `drizzle-kit push` sees no rename ambiguity. Review the push diff before the first deploy.

---

## 5. Job and worker architecture

**Decision: B, a separate Marketing Studio worker, REQUIRED (own PM2 app named `gravyblock-marketing-worker`, own process, own resource limits).** The web app only submits jobs (inserts `ms_media_jobs` rows); no media work ever runs in the web process or the existing growth worker. The marketing worker has its own queue, concurrency controls, temp directory, media workspace, log files, health state (heartbeat row plus admin view), kill switch, retry/backoff and cleanup process. Reasons: the existing worker is a single sequential 30-minute tick that houses every customer-facing and House duty, so one slow render would delay scans, billing and measurement; it has no memory or CPU isolation; and the box has no swap, so one oversized job can take the whole host down.

Design:

- **Process**: `gravyblock-marketing-worker`, `tsx src/worker/marketing.ts`, run under a systemd unit (or `systemd-run`) with a memory ceiling, CPU quota of at most one core, `Nice=19`, `IOSchedulingClass=idle` and a bounded task count. A cgroup kill takes out the marketing worker only, not production. A PM2 `max_memory_restart` is a second line of defense. **All numeric limits below are provisional placeholders, deliberately conservative, and are replaced by values chosen from the Phase 2 benchmark. None is a claim about safe operating points.**
- **Admission control (resource governor)**: before starting any heavy job check free RAM against a floor, the 1-minute load average against a ceiling, free disk against a floor, and that no GravyBlock deploy build is running (the self-deploy lock `/tmp/gravyblock-self-deploy.lock`). Defer, never fail, on any of these. Initial placeholders (to be tuned from measurement): RAM floor well above the current headroom so Studio only starts when production has clear slack, load ceiling below saturation of the 2 vCPU, disk floor leaving a wide margin for Postgres and logs. Phase 1 runs only metadata and queue work, so these gates are exercised but not stressed.
- **Heavy-job concurrency**: exactly 1 heavy render (video or Chromium-based image batch) at any time until the benchmark proves more is safe. Light jobs (metadata, QA text checks) are separate and small.
- **Output limits**: hard maximum output file size and duration per job type, hard job timeout, and a per-job temp-size budget; exceeding any kills the job process group and fails the job without retry storms.
- **Queues** (all in `ms_media_jobs`, claimed with `FOR UPDATE SKIP LOCKED` and a lease): `capture_ingest` and `qa` (light, concurrency 2), `render_image` (concurrency 1, one Chromium page at a time), `render_video` (concurrency 1, global single slot), `tts` (concurrency 1), `publish` (concurrency 1, rate limited per platform). Total concurrent heavy jobs: 1.
- **Priorities**: approved-and-scheduled publish > manual operator request > scheduled campaign generation > background variant generation.
- **Timeouts**: image 60 s, QA 120 s, TTS 120 s, video 15 minutes wall, each enforced with a process-group kill (`timeout`/AbortSignal plus SIGKILL of the ffmpeg and Chromium child group).
- **Retries**: max 3 attempts with exponential backoff and jitter (2, 10, 45 minutes); stage checkpoints mean a retry resumes at the failed stage; after the cap the job goes to `dead` and surfaces in admin. No silent infinite retry.
- **Stall protection**: a heartbeat every 10 seconds while running; a reaper requeues jobs whose lease expired; a supervisor alerts if the queue has runnable jobs and nothing completed for a configured interval. Pipeline stopping must be loud.
- **Disk budget: initial Studio ceiling of approximately 8 GB total (tmp + media + logs), a ceiling and not a target.** Layout: `/var/lib/gravyblock-marketing/{tmp,media,logs}`. One working directory per job under `tmp/<job-id>`, purged on completion or failure; a startup and periodic sweep removes orphans past an expiry; final assets live in content-addressed `media/`. Controls: per-product quotas (a fraction of the ceiling, so no product can starve the others), temp-file expiration, bounded generated-media retention (intermediates deleted immediately, rejected variants after a short window, approved outputs kept until product deletion or quota pressure evicts the oldest unapproved), cleanup after failed jobs, and low-disk protection: when free space on the volume approaches the safety floor, or Studio usage nears its ceiling, the worker **stops accepting render jobs** (queued jobs wait, new submissions are refused with a clear admin message) rather than affecting production. Usage is measured, not estimated, via `du` on the Studio tree each cycle and recorded in `ms_usage`.
- **Emergency global Studio disable**, three layers: (1) file `/var/lib/gravyblock-marketing/DISABLE` checked before every job claim and periodically mid-job (presence stops claims and kills the running child process group); (2) `ms_settings.kill_switch` toggled from admin; (3) `pm2 stop gravyblock-marketing-worker` as the manual last resort. Publishing has its own kill switch checked immediately before each platform call (copy of `assertOutreachSendingAllowed`: fail closed on any read error).
- **No impact on production**: separate process and cgroup, own small DB pool (max 3), no shared tables with write access beyond `ms_*`, no changes to the web or main worker processes, no deploy coupling (the Studio worker is not restarted by a GravyBlock web restart unless its own files changed).
- **Windows PC: not part of the architecture.** No render agent, no pull endpoint, no dependency on Chris's machine being on, logged in or running any tool.
- **If the benchmark shows the VPS cannot carry video safely**: STOP and report the measured evidence. Do not automatically move rendering to the PC, do not buy infrastructure, do not add a paid rendering service. More compute, if ever needed, is a separate decision.
- **Phase 2 benchmark (required before any automatic video production)**: see section 13. No numbers are stated here because none have been measured.

---

## 6. Image and graphics pipeline ($0, deterministic first)

Principle: text and layout are rendered by code from approved strings, so spelling, numbers and branding cannot be hallucinated. AI never types text onto an image.

- **Primary renderer: HTML/CSS template to PNG with Playwright** (one pooled Chromium, one page at a time). It gives real typography, gradients, shadows, emoji, RTL if ever needed, and the same template can target several sizes by CSS variables. Bundle brand fonts (OFL fonts only) in `studio-assets/fonts` and load them with `@font-face`, because the box only has DejaVu and Liberation.
- **Secondary: SVG templates** rasterized with `sharp` (declare it explicitly) for simple badges, store buttons, icon grids and speed. Sharp also does resize, crop, rounded corners, compositing screenshots into device frames and format conversion.
- **Canvas is not needed** in v1; HTML rendering covers it.
- **Inputs**: owner-approved logo, screenshots and captures only. Device frames are neutral SVG masks. Screenshots may be cropped, scaled and framed, never redrawn, edited or composited so as to imply UI that does not exist.
- **Aspect ratio presets** (declared once, each template provides safe zones): 1:1 (1080x1080), 4:5 (1080x1350), 9:16 (1080x1920), 16:9 (1920x1080), 1.91:1 (1200x628 link cards), 1280x720 thumbnails. Exact platform specs are VERIFY at build time.
- **Where deterministic rendering replaces AI**: announcements, feature cards, release notes, "now available on" banners, quote/stat cards (stats only from facts), thumbnails, store badges, countdowns, comparison tables of the product's own versions. AI is optional and only for supporting art (abstract backgrounds) when an image model is already accessible at no cost, off by default (`monthly_llm_usd_cap = 0`), and always labeled.
- **Quality gate** (blocks approval, runs on every variant): every on-image string must exactly equal an approved string from Product Truth or the template (diff check, not model judgment); spell-check of copy against a dictionary plus a per-product lexicon; every number matched to a fact; safe-zone and contrast check; logo present and unmodified (hash match to the approved asset); no more than a set text-area ratio; prohibited-claims scan.
- **Campaign variants**: variant = template x aspect ratio x hook x asset. Generate a small bounded set (for example 3 hooks x 2 templates), not combinatorial explosions.
- **Testing**: golden-image tests (render a fixed fixture and compare pixel diff within a tolerance) using Node's built-in `node:test`, so no new test framework is required.

---

## 7. Video pipeline (isolated, FFmpeg)

Initial target 10 to 60 seconds, vertical first, one render slot, one worker.

```
Product Truth
 -> objective (campaign)
 -> hook variants (LLM or templates, each tagged with fact_refs)
 -> script (sentences, each tagged with fact_refs; display text and spoken text kept separately)
 -> storyboard (scenes: capture clip | screenshot | graphic card | end card)
 -> assets resolved ONLY from approved ms_assets (real captures, screenshots, logo)
 -> graphics (HTML/CSS cards rendered as PNG or short image sequences)
 -> optional narration (local TTS) or silent with captions
 -> FFmpeg assembly (per-scene normalize, concat, crossfade, scale/pad to 9:16)
 -> captions (ASS/SRT burned in via libass from the same script text)
 -> music (owned or licensed track with a recorded license; loudness-normalized, ducked under narration)
 -> branding (intro/outro card, logo watermark within safe zone)
 -> QA (automated gate)
 -> preview (admin review player)
 -> approval -> publishing queue or export bundle
```

Design rules:

- **Real footage only.** Gameplay and app demos come from owner-supplied captures (Unity recorder or phone screen recording, `adb screenrecord`, Playwright video for web apps and browser games). Each capture is an `ms_assets` row with a hash and `approved=true`. The storyboard may trim, speed-ramp within a stated limit, crop, caption and annotate real footage. It may never synthesize, splice to imply continuity that did not occur, or substitute generated footage. If no approved capture exists for a claimed feature, the scene cannot be created.
- **Deterministic scene graph**: a storyboard JSON compiled to one ffmpeg filtergraph; every output is reproducible from `(storyboard, asset hashes, template versions, ffmpeg version)`.
- **Captions from the same source as narration**: each sentence is synthesized separately; the actual audio duration measured with `ffprobe` sets the caption timing and the scene length. No separately estimated timing, so sync cannot drift.
- **Numbers and pronunciation**: display form and spoken form are separate fields; a normalizer expands numbers, dates, versions and symbols ("v1.2" to "version one point two"), and a per-product pronunciation lexicon handles names (ScribbleZap, Mibble, LeaguePour). Both forms are reviewed in the preview.
- **Narration ($0 options)**: local Piper TTS (open source, runs on CPU, quality to be judged in the spike) or no narration with captions and music, which suits most Shorts and removes pronunciation risk entirely. Do not use unofficial scraping TTS services.
- **Music**: only tracks you own or with a recorded license note; no scraping, no copyrighted tracks.
- **Encoding**: H.264 + AAC, `-movflags +faststart`, `-preset veryfast` to start, 30 fps, `loudnorm` to about -14 LUFS (tuned in spike), 1080x1920 with 720x1280 fallback if time or memory demand it.
- **QA gate (automated, blocks approval)**: `ffprobe` duration within the planned tolerance; no frame is black or frozen beyond a threshold (`blackdetect`, `freezedetect`); audio not silent and loudness in range (`silencedetect`, `ebur128`); caption text equals script text exactly; sampled frames contain the expected cards; every footage scene maps to an approved capture hash; claim and prohibited-phrase scan over script and captions. Optional free OCR (Tesseract) on sampled frames to compare on-screen text with approved strings.
- **Approval**: human watches the rendered preview at Levels 1 and 2. Nothing publishes without an approval record.
- **Platform disclosure**: AI-generated or synthetic voice and realistic synthetic imagery require disclosure labels on several platforms (VERIFY current rules). Store a `synthetic_content` flag per variant and surface it at publish time.

---

## 8. Product Truth

Extend the Business Truth idea, do not reuse its tables or keys.

- **Fact keys** (examples): `product_name`, `tagline`, `description_short`, `description_long`, `kind`, `platforms` (iOS, Android, web), `store_url_ios`, `store_url_android`, `website_url`, `core_features[]` (each with a verified source), `game_modes[]`, `audience`, `age_rating` (only if from a listing), `pricing` (only verified, including "free" and in-app purchase statements exactly as stated in the listing), `release_version`, `release_date`, `changelog_items[]`, `screenshot_asset_ids[]`, `brand_colors`, `logo_asset_id`, `cta_primary` (text + URL), `support_url`.
- **Sources, in order of authority**: owner-entered and approved (admin form), store listing text (fetched read-only with `safeFetchText`, hashed, diffed), the product's own public page (read-only crawl, as the Business Truth crawler does), approved asset metadata. No third-party reviews or press unless the owner adds them as an approved fact.
- **Ingestion**: read-only. It never writes to the product site or app. Store listings are fetched as public HTML only; no scraping behind logins.
- **Claims layer**: `ms_claims` approved claims must reference fact ids; prohibited claims are explicit (for example "number one", "best", unsupported "free forever", health or earnings promises, comparisons to named competitors, anything about unreleased features).
- **Grounding rule**: every generated text unit (hook, caption, post, script sentence) returns `fact_refs`; a validator rejects any unit that is unreferenced or whose referenced fact does not support the stated claim by structured comparison (numbers, names, platforms, price strings). The model may phrase, never invent. If a product has fewer than the minimum fact set (name, one verified feature, one verified URL, one approved asset), generation is refused ("no truth, no output").
- **Freshness**: facts carry `verified_at` and `expires_at` (store prices and versions short, descriptions long). Stale facts block scheduled publishing until re-verified.
- **House, internal and customer products**: the same truth model for all; internal products are enrolled by an admin with the owner's facts entered once. Nothing is enrolled automatically, including any example product in the brief.

---

## 9. Atlas: OUT OF SCOPE / NO DEPENDENCY

Atlas is not audited, not copied, not called and not a fallback. Studio implements its own FFmpeg composition, captions, narration, scheduling, job supervision and media validation inside GravyBlock/VPS infrastructure.

Generic reliability requirements Studio meets on its own merits:

| Requirement | Studio design |
|---|---|
| Accurate captions | Captions generated from the same script string used for narration and compared for exact equality in QA. |
| Correct numbers | Separate display and spoken forms with a normalizer; both reviewed in preview; numbers in captions must equal fact values. |
| Correct pronunciation | Per-product lexicon; silent-with-captions mode as the safe default. |
| Timing and sync | Per-sentence TTS, durations from `ffprobe`, scene lengths derived from them, no estimated timing. |
| Pipeline never stalls silently | Leases, heartbeats, reaper, stage checkpoints, dead-letter state, stall alert, per-job timeouts with process-group kill. |

### Long-term autonomy (target state, reached in stages)

After initial account connections and approved rules, Studio should, without ongoing operator effort: identify opportunities (a release, a new approved capture, a stale channel, a feature with no recent content); select products and campaigns within the rules; create assets and videos; validate them through the automated gate; schedule authorized content; publish where an official API permits; measure performance; learn which creative and channel work; and improve later campaigns. Mechanics: an opportunity scanner reading Product Truth changes and the metrics table; a deterministic learning step (best hook type, template, aspect ratio and posting window per product, with minimum-sample rules and no invented causal claims); and rules in `ms_automation_rules` that bound all of it (Level 3). Chris sets rules, connects accounts once and reviews exceptions; he does not create campaigns or operate rendering. House Account websites, apps and games stay read-only: Studio produces OFF-SITE materials only. Autonomy is earned through Levels 1 to 2 and platform approvals, not assumed.

---

## 10. Publishing feasibility (nothing connected; VERIFY items come from secondary sources)

Cost of every API below: no fee for the API itself. Real costs are staff time for approvals and any audit.

| Platform | Official API | Direct publish | Account and approval | Limits and format | Scheduled automation | Classification |
|---|---|---|---|---|---|---|
| **Facebook Pages** (images, video, Reels) | Graph API; Reels at `/{page-id}/video_reels` (upload session, then publish) | Yes, to Pages only (not profiles) | Page access token with `CREATE_CONTENT`; permissions `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`; Advanced Access and possibly Business Verification for use on other people's Pages (VERIFY) | Reels API limited to 30 API-published posts per 24 h (Meta docs) | Yes for Page posts via scheduled publish time (VERIFY); we also schedule on our side | **SUPPORTED** for Pages the owner controls (existing code already posts to Pages via Graph); **REQUIRES PLATFORM APPROVAL** before serving customers |
| **Instagram** (feed, Reels) | Instagram Platform content publishing (container then `media_publish`) | Yes, for Business or Creator accounts linked to a Facebook Page | Permission `instagram_business_content_publish`; development mode only for app roles and test users; App Review for others, reported 2 to 4 weeks (VERIFY) | About 100 API-published posts per 24 h, with a conflicting "50" on the same Meta page (VERIFY); Reels length and format limits VERIFY | No native scheduling endpoint; Studio schedules by delaying the publish call | **REQUIRES PLATFORM APPROVAL** for general use; **SUPPORTED in development mode** for the owner's own accounts (VERIFY current dev-mode rules) |
| **YouTube / Shorts** | YouTube Data API v3 `videos.insert` (resumable upload) | Yes | OAuth by channel owner. Unverified API projects created after 2020 are reported to have uploads forced to **private** until a YouTube API Services compliance audit (VERIFY); default quota 10,000 units per day, one upload about 1,600 units, so about 6 per day, and sources disagree on the exact cost (VERIFY) | Shorts is a vertical video up to a duration limit that changed recently (VERIFY); no separate Shorts upload endpoint | Yes: upload private with `publishAt` set, platform flips it public | **REQUIRES PLATFORM APPROVAL** (audit) for public posting at scale; **MANUAL/EXPORT** until then. Do not create extra Cloud projects to multiply quota; that is reported to breach the terms. |
| **TikTok** | Content Posting API (Direct Post and upload-to-inbox/draft) | Direct Post only after audit | Developer app approval plus per-user authorization; unaudited clients are reported forced to private (SELF_ONLY) with about 5 posting users per day, and posts made before audit stay private (VERIFY) | Video size, length and metadata requirements per TikTok guidelines (VERIFY); required UX disclosures around branded content and privacy choice | No scheduling endpoint; Studio schedules on its side | **REQUIRES PLATFORM APPROVAL** (audit); **MANUAL/EXPORT** (or inbox draft that the owner finishes in the app) until approved. **NOT CURRENTLY PRACTICAL** for fully hands-off public posting. |

Practical conclusion:

- Levels 1 and 2 are fully deliverable with **export bundles** (rendered media, captions, title, description, hashtags, UTM link, alt text, per-platform checklist). This works on every platform with no approval at all and is the correct Phase 1 and early Phase 2 publishing mode.
- Facebook Pages is the first place direct publishing is realistic, because code and tokens for it already exist.
- Start the YouTube audit and TikTok audit paperwork only when there is a working pipeline to show reviewers. Do not promise "autonomous posting to all four platforms" anywhere publicly or privately until each approval exists.
- Never use browser automation to drive platform UIs for posting; it breaches platform terms and is brittle. Not proposed.
- Store listings (App Store, Play) are out of scope and untouched.

---

## 11. Automation model

| Level | Behavior | Phase |
|---|---|---|
| 1 | Operator requests a campaign; Studio generates; operator reviews and approves each item; publishing is export or one-click send | Phase 1 to 2 |
| 2 | Studio generates on a schedule from Product Truth; every item waits for approval before publishing | Phase 2 to 3 |
| 3 | Bounded autopilot: auto-publish within rules (`ms_automation_rules`): per-product per-day and per-week caps, allowed platforms and variant kinds, QA score floor, quiet hours, kill switch honored, automatic pause after N failures or any QA regression, expiry date requiring re-enable | Later, only after Levels 1 to 2 have run cleanly and the platform approvals exist |

Rules common to all levels: House and internal products only until proven; every publish passes the same gate (`assertPublishAllowed`: kill switch, rule caps, approval record or Level 3 rule, platform health, per-platform rate limit, idempotency key); every automated action is auditable; a product can be paused independently; Level 3 is a data setting, not a code branch, so lower levels remain the default.

Optional Phase 3 measurement aid: GravyBlock-hosted tracked links (`gravyblock.com/s/<code>` redirecting with UTM) let you count clicks for products whose own sites cannot be touched. It adds a public route, so it needs its own review (fail open, no DB write on the request path, queue the count). It is not part of Phases 1 and 2.

---

## 12. Cost summary

| Item | Cost |
|---|---|
| VPS, ffmpeg, Playwright, Postgres, disk | $0 incremental (existing) |
| Platform APIs (YouTube, Meta, TikTok) | $0 fees; approvals take time, not money |
| TTS (Piper), fonts (OFL), Tesseract, sharp | $0 |
| LLM for hooks and copy | **Budget $0/month (owner decision).** Phase 1 makes no AI calls. Phase 1.5 and 2 use templates, existing assets and genuinely free models or capabilities only. No paid API and no incremental paid usage without explicit approval; the usage gateway enforces `monthly_llm_usd_cap = 0` and refuses paid-model calls. If something cannot be done acceptably at $0, the system reports the exact limitation and expected cost instead of enabling it. (The existing OpenRouter key is pay-per-token, so only models verified as free may be allowed through the gateway.) |
| AI image or video generation | Not planned. If ever wanted, it needs money and approval; not activated. |
| Media storage | Free disk is about 20 GB; Studio has an initial hard ceiling of about 8 GB (a ceiling, not a target). Disk is the first real constraint. |
| Possible future costs, none activated or planned | More compute if the Phase 2 benchmark fails (separate decision; no purchase, no paid rendering service, no automatic move to any other machine); a paid scheduling aggregator; paid music license; any paid model API. |

**Phase 1 expected incremental monthly cost: $0.** Phase 1 makes no LLM calls, no renders and no platform calls, so even the OpenRouter pay-per-token item above is not exercised.

---

## 13. Phased implementation plan

**Phase 1 MUST WAIT until all four are true, and until then no Marketing Studio production code is written or deployed:**
1. The Neon to VPS GravyBlock migration has completed successfully.
2. VPS backup and restore is verified.
3. The GravyBlock worker and autonomous engine are healthy.
4. The remaining DB-dependent acquisition rebuild is completed and verified.

Pilots (prepared for, not started): DrinkKnird, RentalNoodle, ScribbleZap (section 15).

**Phase 1 (lightweight, runs on the VPS, $0, no rendering, no publishing, no paid APIs)**
Scope is exactly:
1. Feature-flagged private Marketing Studio UI under `/admin/marketing-studio`, internal-only authorization (existing admin guard).
2. Studio schema file (`ms_*`, additive only), `drizzle.config.ts` array, review the push diff; `gb_studio` DB role.
3. Product and Brand profiles; Product Truth (facts and claims, entered by an admin and read-only public ingestion); campaign records; brand and media asset metadata (records and local file structure, no rendering).
4. Tenant isolation (required `OwnerScope` on every repository call).
5. Secure credential-reference architecture (encrypted ciphertext plus key id; no platform connections made).
6. Studio job queue (`ms_media_jobs`) and the separate `gravyblock-marketing-worker` with governor, heartbeat, retry/backoff, cleanup and no-op or metadata-only job types.
7. Usage and resource accounting (`ms_usage`, disk measurement), the global emergency disable (file, setting, pm2), and the local media storage tree with the 8 GB ceiling and per-product quotas.
8. Acceptance: tenant isolation tests; kill switch halts claims and a test job within seconds; low-disk and low-RAM gates defer a synthetic job; worker crash leaves production latency and memory unchanged; no write to any non-`ms_` table (verified by the DB role); House sites show zero writes.

**Phase 1.5 (cheap graphics, only after Phase 1 is accepted)**: HTML/CSS to Playwright PNG, SVG, sharp, templates, aspect presets, golden-image tests, QA gate, export bundles. One Chromium job at a time under the same governor. AI image generation only if an approved free capability exists and adds real value; a large share of creative should need none.

**Phase 2 (video, first direct publish): VPS BENCHMARK FIRST, REQUIRED**
Before any automatic video production, run controlled benchmarks on the VPS with representative 15 s, 30 s and 60 s vertical videos (real approved captures plus deterministic graphics, captions burned, branding, QA). One render at a time. Measure render time, peak RAM, CPU load, disk usage, impact on GravyBlock HTTP response time, impact on PostgreSQL, and impact on the other hosted apps (RentalNoodle, TheDrinkPlace and the rest). Stop immediately if production health degrades. Choose all governor thresholds, timeouts and output-size limits from the measurements. If the VPS handles it safely, video stays on the VPS. If not: STOP and report the evidence; no automatic PC offload, no purchase, no paid rendering service.
1. Capture ingest, storyboard compiler, FFmpeg composition, captions, narration option, QA, preview player, publishing queue.
2. Approval queue, scheduling, Facebook Page connection with encrypted token, publish gate, results and metrics pull.
3. Level 2 scheduled generation with approval.

**Phase 3**: Instagram (development mode for own accounts), YouTube audit submission and `publishAt` scheduling, TikTok audit or inbox-draft flow, analytics rollups, optional tracked links.

**Phase 4**: bounded autopilot for internal products, then the customer-facing offer (entitlement, tenant guards, quotas, pricing decision by you), and only then any claim in `capabilities.ts`.

---

## 14. Final owner decisions (Phase 0 finalized)

| Decision | Final |
|---|---|
| Atlas | Permanently OUT OF SCOPE: no dependency, no code reuse requirement, no repository audit, no shared processes, services or credentials, no future runtime relationship. Marketing Studio is fully independent. |
| Runtime | Existing VPS. Chris's Windows PC is not part of normal operation. Studio must ultimately run unattended. |
| Worker | Separate `gravyblock-marketing-worker` with strict isolation and resource controls (section 5). |
| AI/LLM budget | $0/month. Phase 1 uses no AI calls. See section 12. |
| Disk | About 8 GB initial ceiling; one heavy render at a time until the Phase 2 benchmark proves otherwise. |
| Pilots | DrinkKnird (website), RentalNoodle (SaaS), ScribbleZap (game), section 15. |
| Pricing | No Marketing Studio subscription or pricing change now. GravyBlock stays $39.99/month. |

Remaining housekeeping (not decisions): the Marketing Studio handoff document was never attached; reconcile it before Phase 1 if it holds requirements beyond the Phase 0 brief.

---

## 15. Pilot products and governing requirements

### 15.1 Pilots (preparation only)

| Pilot | Product class | What it proves |
|---|---|---|
| DrinkKnird | `website` (content site) | Truth from public pages, announcement and content-promotion graphics, link tracking for a site we cannot modify |
| RentalNoodle | `saas` (web app) | Feature-grounded creative from real screenshots and approved flows, signup-oriented campaigns |
| ScribbleZap | `mobile_game` or `web_game` (set from its real platform listing at enrollment) | Real gameplay captures only, store-link calls to action, install-oriented campaigns |

This is NOT authorization to modify their sites, apps or games, to access their repositories, to change their deployments, or to publish anything externally. Inputs are public, read-only information and later, explicitly approved marketing assets (logo, screenshots, captures) supplied for Studio. Whether each is a House Account row is decided at enrollment (`owner_kind` `house` or `internal`); either way Studio has no write path to it. Nothing is enrolled until an admin does it, after Phase 1 exists. Long term the design covers ALL approved internal House products, not only these three.

### 15.2 Governing requirements this architecture preserves

1. Marketing Studio is an ADDITION inside GravyBlock (`src/lib/marketing-studio`, `ms_*` tables, admin section, its own worker). Existing GravyBlock SEO, AEO and growth functionality stays intact (section 2).
2. House websites, apps and games remain code and content READ-ONLY. Studio imports no site-write code (`site-publish`, publishing adapters, WordPress or connector writers), the existing House write guard is untouched, and after migration a dedicated `gb_studio` Postgres role can write only `ms_*` tables, so a House or product write is not possible even through a bug.
3. Studio creates OFF-SITE marketing only.
4. Product Truth grounds every claim (section 8); no truth, no output.
5. No fabricated gameplay, features, results or reviews. Footage comes only from approved real captures; stats only from facts; reviews and testimonials only if the owner supplies them as approved facts.
6. Eventual autonomy (reached by levels, section 11 and 9): identify opportunities, choose campaigns, create graphics, videos and copy, validate output, publish to authorized external accounts where APIs allow, measure traffic, install, signup and revenue outcomes, then learn and improve future campaigns. Outcome measurement for products whose sites cannot be touched relies on platform insights, store or analytics data the owner already has and explicitly shares, and optional GravyBlock-hosted tracked links (section 11), never on editing the product.
7. Goal: minimal recurring human work after initial setup (connect accounts once, set rules, review exceptions).
8. Commercialization without a rebuild: ownership is already modeled (`owner_kind`, `organization_id`, optional `business_id`), every repository call requires an `OwnerScope`, credentials are per-connection and encrypted, deletion and purge are built in, `ms_usage` and `ms_settings` carry per-owner quotas, and entitlements read through the existing `entitlement.ts` seam. Turning Studio on for customers later is configuration plus a pricing decision, not a redesign.
9. No Marketing Studio subscription or pricing change now. Existing GravyBlock remains $39.99/month, and Studio is not mentioned in public claims (`capabilities.ts`) until it runs in production.
