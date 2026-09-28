# Autopilot architecture (current production)

Last verified against production code: 2026-09-27 (live commit `bb176c3`).

This describes how the autonomous engine actually works today. The two companion docs are
authoritative for their areas and must stay in sync with this one:

- `docs/orchestration-authority.md`: every scheduled job, classified by who is allowed to decide.
- `docs/site-connector-protocol.md`: how GravyBlock writes to a customer's website.

If this doc and the code disagree, the code wins. Fix the doc.

## The loop in one paragraph

Observers scan each business and record candidate work as rows in one ranked queue
(`growth_opportunities`). Once a day the orchestrator reads that queue per business, picks the
top-ranked distinct opportunity types, and calls the real action for each. Every action is
verified against the live external surface (the live page, the live listing, the prospect's
page) before it counts. Verified work is written to the proof ledger, and opportunities that
carry a measurement plan are re-evaluated later with real data. Outcome statistics feed back
into ranking weights.

```
Business Truth (business_facts)
        |
        v
Observers / scanners  --record-->  growth_opportunities  (one ranked queue)
                                            |
                                            v
                              opportunity orchestrator (only decider)
                                            |
                                            v
                         channel action (SEO fix, article, GBP post, pitch...)
                                            |
                                            v
                     external verification (re-fetch live surface, never trust API "success")
                                            |
                         +------------------+------------------+
                         v                                     v
                  proof_ledger (levels 1-3)          measurement plan -> evaluator
                                                               |
                                                               v
                                                  learning.ts (ranking weights)
```

## Layers and where they live

| Layer | What it does | Code |
|---|---|---|
| Business Truth | First-party facts about the business with provenance, content hash and freshness. Every generator reads from it; if truth is insufficient, nothing is produced. Stale facts invalidate the opportunities they created. | `src/lib/truth/*`, table `business_facts`, `truth_pages` |
| Diagnosis | Free scan and prospect reports: Google Places details, site crawl, estimated local rank, AI visibility probes. Scores are versioned (`scoreMethodVersion`) and activity-free. | `src/lib/report/generator.ts`, `src/lib/audit/*`, `src/lib/scoring/*` |
| Opportunity queue | Single ranked queue. Rows carry type, subtype, `valueClass` (hygiene 0.4x, growth 1.3x), per-row TTL, business-mode snapshot, eligibility label, measurement plan and measured result. | `src/lib/opportunities/queue.ts`, `classify.ts`, `strategy.ts`, `maturity.ts`, `types.ts` |
| Orchestrator | The only component that decides and acts on marketing work. Diversity-capped per run so one channel cannot monopolize. Each step reports acted / blocked / not_worth_acting / skipped. | `src/lib/opportunities/orchestrator.ts` (`runOrchestrator`, `runOrchestratorBatch`) |
| Channel actions | Real executors the orchestrator dispatches to (see table below). | per channel |
| Verification | Re-fetches the live URL or surface after any write. Failed paths are reverted individually. | e.g. `verifyBasicSeoActions` in `src/lib/seo/basic-autopilot.ts` |
| Proof ledger | Only externally verified work. Level 1 = execution, 2 = search visibility, 3 = business result. Level 1 rows mature in place to level 2 (same dedupe key). Case studies need level >= 2. | `src/lib/proof/*`, table `proof_ledger` |
| Measurement | One canonical result shape: `TOO_EARLY`, `POSITIVE`, `NEGATIVE`, `NO_MATERIAL_CHANGE`, `INCONCLUSIVE`. Lifecycle status and measured result are separate columns with separate writers. | `src/lib/opportunities/measurement.ts`, `evaluate.ts` |
| Learning | Deterministic statistics per (opportunity type, business mode) across all businesses. Needs >= 5 resolved measurements, bounded to +/-30%, no LLM in the loop. | `src/lib/opportunities/learning.ts` |

## Opportunity types and their executors

| Queue type | Recorded by (scan only) | Executed by (orchestrator handler) |
|---|---|---|
| Existing-page SEO / schema / CTR / technical / conversion | `basic_seo_batch` -> `runBasicSeoForBusiness(id, { scanOnly: true })` | `runBasicSeoForBusiness(id)` in `src/lib/seo/basic-autopilot.ts` |
| `content_gap` | `truth_opportunities_batch`, content planner | content planner + publish via site adapter |
| `backlink` (authority) | `authority_discovery_loops_batch` (unlinked mentions, broken links), weekday `authority_batch` (discover + qualify + verify only) | `actOnBestAuthorityOpportunity` in `src/lib/authority/engine.ts` |
| `aeo` | `aeo_action_batch` with `scanOnly` | `src/lib/ai-visibility/aeo-actions.ts` |
| `competitor_gap` | `competitor_gap_batch` with `scanOnly` | `src/lib/competitors/gap-engine.ts` |
| `citation` | `citation_engine_run` | `src/lib/citations/engine.ts` |
| `gbp` | `cross_engine_opportunity_scan` (connected + no recent post) | `postGbpForBusiness` in `src/lib/gbp/post-publisher.ts` |
| `social` | `cross_engine_opportunity_scan`, `truth_opportunities_batch` | `planTruthGroundedSocial` in `src/lib/social/truth-social.ts` |
| `pending_review_requests` | `cross_engine_opportunity_scan` (only when real due requests exist) | `runReviewRequestSendBatch(10, businessId)` |

Rules that must not be broken (see `docs/orchestration-authority.md` for the full table):

- No cron job may bypass the queue to make a marketing decision. Independent batches run in
  `scanOnly` / discovery-only mode.
- Two maintenance carve-outs act without the orchestrator because they are not priority choices:
  `auto_repair_batch` (fixes a broken page GravyBlock itself published) and
  GBP review replies (`runGbpReviewReplyBatch` in `src/lib/gbp/review-responder.ts`, every worker tick; reply to an unanswered review).
- Publishing already-queued content (`processContentQueue`, Reddit/Facebook posting batches) is
  an executor of an upstream decision, not a new decision.
- Authority follow-ups continue a send the orchestrator already started, so they are gated by
  health/budget/authorization only, not by `sendEnabled`.

## Eligibility labels

`classifyEligibility()` in `queue.ts` labels every open opportunity:
`AUTO_ELIGIBLE`, `BLOCKED_ONE_TIME_CONNECTION`, `NOT_WORTH_ACTING`, `ACTING`, `MEASURING`.
`allOpenRanked(businessId)` exposes all of them, so "blocked because the site is not connected"
is visible per opportunity.

## Operating modes and capability profile

- Business mode (local / regional / national / online) comes from `src/lib/business-mode.ts`.
  `strategy.ts` weights opportunity types by mode, so the same ranking formula prioritizes
  differently per business.
- `src/lib/capability-profile.ts` combines operating mode, site capabilities and connection
  readiness into one profile that engines gate on. Engines never assume a capability exists.

## Site publishing

All writes to a customer's site go through one adapter interface (`src/lib/site-publish/adapters.ts`):
WordPress, Webflow, Shopify, and the signed `managed_feed` connector. Content is published only
to the customer's own site and verified live. There is no internal noindex fallback. Details:
`docs/site-connector-protocol.md`.

## Onboarding pipeline

`src/lib/setup/onboarding-pipeline.ts` establishes a business's real baseline, called identically
from Stripe checkout and for house accounts. It is resumable and idempotent per component.
`automation_ready` requires business_identity, website_crawl, score_snapshot,
ai_visibility_baseline, citation_baseline and recurring_scheduled. Google-dependent components
(place identity, competitor/ranking baselines, GBP status) are `needs_customer_action` and do not
block readiness.

Recurring refresh chains are protected by `backfillMissingRecurringJobs()` (daily), after the
August 2026 incident where an unawaited reschedule silently stopped automation for weeks.

## House accounts and canaries

Owner businesses (`businesses.account_type = 'house'`) run on the real platform. Known house
sites include Boating Chicago, LeaguePour and SeeStew (all on the managed feed). The
`canary_assertions_batch` runs generic checks against house accounts by account type, never by
name: truth is current, no stale promotion, proof only verified, no unsafe outreach, no guessed
contacts, actions verify externally. iScream Studio (parent company) must never appear on public
proof or case studies and is hard-excluded in code.

## Public claims

`src/lib/capabilities.ts` is the canonical statement of what paid plans do (`automatic`,
`partial`, `not_implemented`). Public pages, templates, FAQ answers and emails must match it.
It is intentionally conservative: a few engines exist in code but are still described there as
partial or not implemented (for example GSC-based existing-page optimization is dormant because
no business has GSC connected). Do not upgrade a status until the engine demonstrably runs in
production.

## Known gaps (as of 2026-09-27)

- GSC-based existing-page SEO (`existing_page_seo_batch`) records `seo_opportunities` but is not
  yet unified into `growth_opportunities`; dormant because no business has GSC connected.
- Some broad multi-business sweeps (citation engine, AEO recheck, watchdog) still run as their
  own batches as a safety net and are not fully folded into the orchestrator.
- Production schema changes use `drizzle-kit push` during self-deploy (see
  `GRAVYBLOCK_FULL_HANDOFF_FOR_CLAUDE.md`, deployment). An ambiguous rename now fails loudly
  instead of guessing, but a move to `generate` + `migrate` is still recommended.
