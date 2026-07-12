# GravyBlock acquisition plan — July 2026 (v2)

## Ads verdict (July 12)

Paid search was tried and didn't convert. Expected for this stage: local-SEO
keywords cost $5-15/click and an unknown brand converting cold clicks straight
to an $80/mo subscription rarely pays back without proof assets (testimonials,
case studies) and retargeting. **Ads stay off until there are at least 5 paying
customers and 3 public case studies.** Then retry with retargeting only.

## v2 strategy: lead with proof, not promises

Two assets competitors can't copy:
1. **The scan engine can produce a real report for any business before we ever
   talk to them.** So outreach now leads with "your business scored 54/100,
   here's your report" instead of "come run a scan" — the work is pre-done and
   the number is real. (Shipped July 12 — see below.)
2. **The owner runs real house businesses on the platform.** Those are living,
   verifiable case studies: real scores over time, real published content,
   real GBP activity. Publishing "we run it on our own businesses, watch the
   numbers" is proof no stock testimonial can match.

## Goal

- **First paying subscriber within 14 days** (by July 25, 2026)
- **5 paid subscribers within 30 days** (by Aug 10)
- **15 paid subscribers within 60 days** (by Sep 10)

Tracked weekly against `/api/admin/stats` (outreach volume, leads) and the MRR
dashboard. If the 14-day goal is missed, the diagnosis section below gets
revisited with real numbers before scaling spend.

## Why zero subscribers so far (diagnosis, July 11)

The funnel is **input-starved**, not broken at conversion:

1. **~34 total scans in ~2 months, mostly the owner's own accounts.** Even a
   good scan-to-paid rate (3-5%) needs hundreds of real scans before the first
   conversion is statistically expected. The funnel never had enough input to
   produce a subscriber.
2. **Cold outreach is the only active channel and runs at single-digit sends
   per window.** Infrastructure supports ~52/day (4 windows × 13), but the
   prospect pool per city+industry query filtered down to ~7-10 emailable
   businesses, so actual volume was far below the cap.
3. **No launch ever executed.** The Product Hunt kit and /launch page exist,
   but the launch never happened. No directories, no communities, no ads.
4. **Domain is ~2 months old** — the 250+ programmatic SEO pages can't rank
   for competitive terms yet. SEO is a compounding channel, not a 30-day one.

## Channel plan

### Agent-executed (shipping via code)

| Lever | Status |
|---|---|
| **Pre-scanned outreach: every cold email now carries the prospect's real score + direct report link** | ✅ shipped July 12 |
| 3x outreach prospect pool (query variants per city+industry) | ✅ shipped July 11 |
| Removed false "sent by hand" line from outreach email (spam-complaint risk) | ✅ shipped July 11 |
| Pre-filled scan links in outreach (fallback when pre-scan fails) | already live |
| 14-day lead drip + abandoned-checkout emails | already live |
| "Powered by GravyBlock" + scan CTA on published customer articles | already live |
| Referral links per business | already live |
| House-account public case study page (/proof) — opt-in per business from admin; iScream Studio (parent co) permanently excluded | ✅ shipped July 12 — owner toggles businesses in |
| OUTREACH_FROM_EMAIL env split so cold email moves to a separate sending domain the moment it's bought | ✅ shipped July 12 |
| Vertical concentration: reweight outreach calendar to 2-3 proven verticals once reply data shows a winner | after 2 weeks of pre-scan data |
| Weekly watch: raise emailsPerBatch from 13 → 20 via admin /outreach settings once bounce rate confirmed <3% | pending owner OK |

### Owner actions (agent can't do these)

1. **Buy the cold-email sending domain** (e.g. trygravyblock.com or
   gravyblockhq.com, ~$10/yr), add it to Resend (SPF/DKIM), then set
   `OUTREACH_FROM_EMAIL` on the VPS. Code is already wired — links in the
   emails keep pointing at gravyblock.com; only the from-address changes.
   Unlocks scaling from ~50/day toward 100-200/day safely.
2. **Toggle house businesses onto /proof** from each business's admin page
   (Public showcase section). iScream Studio is hard-excluded (parent co).
3. **Submit to free directories** (agent will draft all copy on request):
   AlternativeTo, SaaSHub, There's An AI For That, Uneed, MicroLaunch,
   BetaList, Indie Hackers product page, G2/Capterra.
4. **Product Hunt: deferred by owner decision until 20-50 paid users.**
   Kit stays ready in `docs/`; /launch page stays unindexed until then.
5. **Ads: off** until 5+ customers and 3 public case studies (see verdict).

## Deliverability guardrails (cold outreach)

- Stay under ~60 sends/day from the current domain; watch bounce % on the
  Resend dashboard weekly. Pause the channel if bounces exceed 5%.
- Every email has a working opt-out (already enforced in code) and a truthful
  P.S. line (fixed July 11).
- The `info@domain` guessing yields low open rates; if reply rate stays <0.5%
  after the pool widening, next step is a contact-page email extractor rather
  than more volume.

## Weekly review cadence

Every Friday: sends, bounces, leads created, scans run, checkouts started,
subscribers. Compare against goal line. Adjust one lever at a time.
