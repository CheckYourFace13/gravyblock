# Scheduler ownership — who decides what marketing work runs

Every scheduled job in `src/worker/index.ts` that touches a marketing channel is one of exactly
three things. There is no fourth category (an independent job that decides for itself which
marketing action a business should get).

- **A. OBSERVER/SCANNER** — reads state, creates/refreshes `growthOpportunities` rows. Never
  applies a change, sends anything, or publishes anything.
- **B. ORCHESTRATOR INVOKER** — calls `runOrchestrator(businessId)` (or is itself the
  orchestrator's scheduled batch), which reads the ranked queue and decides.
- **C. EXECUTOR OF AN ALREADY-SELECTED ACTION** — runs only after the orchestrator (or a
  measurement evaluator) has already decided; verifies, publishes already-queued content, or
  evaluates an already-attached measurement plan. It does not choose between channels.

| Channel | Job | Class | Notes |
|---|---|---|---|
| SEO/technical/conversion | `basic_seo_batch` | A | `runBasicSeoBatch` now calls `runBasicSeoForBusiness(id, { scanOnly: true })` — records defects, never applies a fix. |
| SEO/technical/conversion | `opportunity_orchestrator_batch` | B | The only path that applies a basic-audit fix (`seoHandler` → `runBasicSeoForBusiness(id)`, scanOnly:false). |
| SEO (GSC-based) | `existing_page_seo_batch` | A | `runExistingPageSeoBatch(5, { scanOnly: true })` — fetches GSC, records `seo_opportunities`, never edits a page. Not yet unified into `growthOpportunities` (disclosed gap; zero canaries have GSC connected). |
| Technical (repair) | `auto_repair_batch` | C (maintenance) | Fixes an already-broken page (404/noindex/missing schema) on a page GravyBlock itself published — not a choice between channels, just fixing something broken. Treated like the site watchdog. |
| Content | `content_generation` (queue-content) | A/B mix | Queues content for businesses with an empty queue; actual publish decision for content_gap opportunities runs through the orchestrator's `content_gap` handler. |
| Content | `processContentQueue` | C | Publishes whatever is already `status: "queued"` in `content_queue` — does not decide what to write. |
| GBP | `scanCrossEngineOpportunitiesBatch` | A | Records a `gbp` opportunity only when connected + no recent post. |
| GBP | `opportunity_orchestrator_batch` | B | `postGbpForBusiness` is called ONLY from the orchestrator's `gbp` handler now — the old independent `runGbpPostBatch` worker entry was removed. |
| GBP (review replies) | `gbp_review_reply_batch` | C (maintenance) | Always-correct action (reply to an unanswered review) — not a priority choice against other channels. |
| Social | `scanCrossEngineOpportunitiesBatch` + `truth_opportunities_batch` | A | Record `social` opportunities from freshness/new-fact signals. |
| Social | `opportunity_orchestrator_batch` | B | `planTruthGroundedSocial` (which queues content) is called only from the orchestrator's `social` handler. |
| Social (publish) | Reddit/Facebook posting batches | C | Publish whatever is already `status: "queued"` with kind `reddit_post`/`facebook_post`/`instagram_caption` — the decision to create that content happened upstream (orchestrator or content-planner), not here. |
| Reviews / review generation | `scanCrossEngineOpportunitiesBatch` | A | Records `pending_review_requests` only when real due requests exist. |
| Reviews / review generation | `opportunity_orchestrator_batch` | B | `runReviewRequestSendBatch(10, businessId)` is called only from the orchestrator's `review` handler — the old independent whole-account `review_request_send_batch` worker entry was removed. |
| Citations | `citation_engine_run` | A | Same deterministic check every run (NAP consistency, class A-E state) — no channel-priority branching to duplicate. |
| Authority | `authority_discovery_loops_batch` | A | `discoverUnlinkedMentions` / `discoverBrokenLinkOpportunities` — discovery only. |
| Authority | weekday `authority_batch` | A | `runAuthorityBatch({ maxBusinesses: 10 })` — `sendEnabled` defaults to `false`, so this is discover + qualify + verify-acquired only. |
| Authority | `opportunity_orchestrator_batch` | B | `actOnBestAuthorityOpportunity` (the only sender) is called only from the orchestrator's `backlink` handler. |
| AEO | `llm_probe_batch` | A | Baseline mention probes. |
| AEO | `aeo_action_batch` | A | `runAeoActionForBusiness(id, { scanOnly: true })` — records `aeo` opportunities, never queues an article. |
| AEO | `aeo_action_batch` (recheck half) | C | `runAeoRecheckBatch` evaluates already-queued/published AEO actions — not a new decision. |
| AEO | `opportunity_orchestrator_batch` | B | The only path that queues a new AEO article. |
| Competitor-derived | `competitor_gap_batch` | A | `runCompetitorGapForBusiness(id, { scanOnly: true })` — records gaps, never queues a page. |
| Competitor-derived | `opportunity_orchestrator_batch` | B | The only path that queues a competitor-gap page. |

**`CAN ANY CRON BYPASS QUEUE? = NO`** for every row above except the two explicitly labeled
"maintenance" (auto-repair, GBP review replies), which the acceptance criteria itself carves out
as jobs "not making a marketing prioritization decision."
