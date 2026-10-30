# Free scan and report conversion plan (implement after the VPS database migration)

Status: plan only. Nothing here is implemented, and no schema change is proposed. It depends on production data, so build it only once the database is reachable and the funnel numbers have been read.

## 0. Gate: read the real funnel first

Query `funnel_events` (and `leads`, Stripe sessions) for 7, 30 and 90 days, excluding admin, house accounts, QA, outreach/system scans and identifiable bots. Compute step conversion: scan visit, scan start, business match, preview generated, `report_landed`, `report_unlocked` (email gate), Start GravyBlock click, Checkout session, paid subscription. Proceed with section 1 only if the drop between `report_landed` and `report_unlocked` is a major loss (the earlier read showed essentially no unlocks).

## 1. Remove the mandatory email gate

Current behavior (`src/components/report-view.tsx`):
- `unlocked` state starts from `verifyReportUnlockToken(publicId, ?unlock=)`.
- When locked, only the summary renders; `AutopilotRoadmap`, the data-sources block, the ranked findings list (about lines 164 to 340) and the offers render only when `unlocked`.
- `ReportUnlockCard` (`src/components/report-unlock-card.tsx`) posts to `unlockReportAction` (`src/app/actions/report-unlock.ts`), which saves a lead (`source: report_form`), sends the delivery email and tracks `report_unlocked`.

Change:
1. Render the full report unconditionally (drop the `unlocked ? ... : null` guards and the `initiallyUnlocked` / `unlockToken` plumbing; keep `verifyReportUnlockToken` accepted but ignored so old emailed links still work).
2. Replace `ReportUnlockCard` with an optional "Send me a copy of this report" form that reuses `unlockReportAction` (same lead save, same delivery email, same `report_unlocked` event, so reporting continuity is kept). Copy: "Save this report", not "Unlock".
3. Remove stale plan plumbing: `selectedPlan` / `?plan=starter|growth|pro|agency` in `report/[publicId]/page.tsx`, `report-view.tsx`, `report-unlock-card.tsx`, `scale-cta.tsx` ("ScaleOffer"/"StickyScaleBar" naming), and the `scaleUrl: ...&plan=growth` in the delivery email. One CTA only: `Start GravyBlock — $39.99/month` linking to the single checkout path, with a short explanation: connect once where needed, GravyBlock prioritizes the work, does the eligible work automatically, verifies it, measures it, keeps going. No plan chooser, no second lead form before Stripe.
4. Keep the report `robots: noindex`. Funnel events stay (`report_landed`, `report_unlocked`, offer click, checkout).

## 2. Maps visibility presentation (real data only)

Data available: `LocalRankingSummary.checks[]` (`src/lib/report/types.ts`). Each check is ONE estimated position per query (`estimatedPosition`, `inTop3`, `inMapPack`, `confidence`, source `estimated_local_rank`) plus the sampled competitors with `position`, `rating`, `reviewCount`. There is no multi-point or per-location sample, so a geo-grid MUST NOT be drawn (never fan one rank out into map pins).

Build a "Maps visibility snapshot": for each query, a labeled card with the estimated position (explicitly "estimated"), map-pack yes/no, confidence, and a ranked list of the sampled businesses (you highlighted). If a future scan collects genuine multi-point samples, render a grid only from those stored points.

## 3. AI visibility panel (existing probes only)

Source: `runLlmProbesForBusiness` / `getAiVisibilityStats` (`src/lib/ai-visibility/llm-probes.ts`), which store per-engine probe results. Confirm first whether a scan-time probe result is attached to the report payload; if probes only run for subscribed businesses, the panel must say "not checked yet" rather than infer anything.

Panel rows: engine (as recorded), result (mentioned / not mentioned / inconclusive, taken directly from the stored probe), competitors actually observed in the answer where stored, and source/citation fields only where the engine stored them. No invented "AI visibility score".

## 4. Competitor snapshot

Reuse `LocalRankingCheck.competitors` (name, rating, review count, position). Table with: business, rating, reviews, observed or estimated position (labeled as estimated), and the plain gaps (review count and rating difference versus the scanned business). No computed claims beyond differences of retrieved numbers.

## 5. Shareable report link (optional, only if safe)

Reports already have `publicId` (unguessable link, `noindex`). A "Copy report link" button on the now-ungated page is enough: it exposes no email or account data because the report payload is business-level. Do not add a new token column. Confirm the payload carries no lead email before enabling.

## 6. Verification checklist after implementation

Scan end to end on production; full report visible without email; optional save form delivers the email and records `report_unlocked`; CTA reaches Stripe Checkout at $39.99 (test session); funnel dashboard shows the new flow cleanly; House Accounts remain website read-only.
