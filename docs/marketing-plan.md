# GravyBlock acquisition plan — July 2026

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
| 3x outreach prospect pool (query variants per city+industry) | ✅ shipped July 11 |
| Removed false "sent by hand" line from outreach email (spam-complaint risk) | ✅ shipped July 11 |
| Pre-filled scan links in outreach (recipient lands on their own results) | already live |
| 14-day lead drip + abandoned-checkout emails | already live |
| "Powered by GravyBlock" + scan CTA on published customer articles | already live |
| Referral links per business | already live |
| Weekly watch: raise emailsPerBatch from 13 → 20 via admin /outreach settings once bounce rate confirmed <3% | pending owner OK |

### Owner actions (agent can't do these)

1. **Launch on Product Hunt.** The kit is in `docs/` and `/launch` page is
   built with the PRODUCTHUNT promo code. This is the single biggest one-day
   traffic event available. Pick a Tuesday-Thursday.
2. **Submit to free directories** (agent will draft all copy on request):
   AlternativeTo, SaaSHub, There's An AI For That, Uneed, MicroLaunch,
   BetaList, Indie Hackers product page, G2/Capterra.
3. **Decide on a separate cold-email domain** (e.g. trygravyblock.com,
   ~$10/yr). Sending 50+/day cold from gravyblock.com risks the domain that
   also sends customer/transactional email. Recommended before any further
   volume increase.
4. **Optional: $10-20/day Google Ads** on "local seo tool for small business"
   style long-tail terms pointed at /scan. Fastest paid lever; skip if
   bootstrapping.

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
