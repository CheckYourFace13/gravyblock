# Marketing Studio Phase 1.5 and Phase 2: runbook

Governing design: `PHASE0-audit-and-plan.md`. Nothing here publishes. Cost: $0.

## Phase 1 hardening
- **Uploads**: the global 11 MB Server Action body limit was removed (default restored). Studio uploads use the dedicated route
  `POST /api/admin/marketing-studio/assets` (admin session, same-origin check, streaming body bounded at 10 MB plus multipart overhead,
  content-validated images only). Remote imports (small URL form) stay a Server Action.
- **Duplicate env keys**: shadowed earlier lines removed from `/home/deploy/gravyblock/.env` after proving the effective values (last line wins in Node `--env-file`,
  dotenv and Next) were byte-identical before and after. A pre-change copy is in `/root/env.pre-dedupe.bak` (root only, mode 600).
- **DataForSEO**: `/v3/business_data/{facebook,trustpilot,google}/reviews/live` do not exist (404, cost 0, verified 2026-11-02). Facebook has no review endpoint at all.
  Trustpilot and TripAdvisor reviews are asynchronous task APIs that this synchronous sync never implemented. These platforms are now classified unsupported and skipped
  (logged once, not retried, not an error).
- **Studio route auth**: unauthenticated requests to `/admin/marketing-studio`, the upload route and the media route are refused (login redirect or 404). Authenticated rendering is the one visual check left for the owner.

## Creative engine (Phase 1.5)
- Templates (`creative/templates.ts`): product_benefit, feature_highlight, announcement, educational_tip, screenshot_showcase, comparison, cta; sizes 1080x1080, 1080x1350, 1080x1920, 1200x628;
  three product-type styles (editorial for websites, clean for SaaS and apps, playful for games). Fonts are OFL (Inter, Playfair Display, Fredoka) bundled from npm and embedded.
- Copy (`creative/copy.ts`): deterministic, from verified facts only. No model, no network.
- Rendering (`creative/render.ts`): headless Chromium started by the worker as its own child process, network fully blocked (data URLs only), killed on emergency disable or hard timeout.
  Binary: `/opt/gravyblock-marketing/chromium/...` (copied from an existing local install; `MARKETING_CHROMIUM_PATH` in `/etc/gravyblock-marketing.env`).
- QA (`creative/qa.ts`): dimensions, decode integrity, blank image, text overflow, minimum size, safe area, contrast (from the theme), logo distortion and resolution, missing or unapproved assets,
  every text traced to a verified fact or fixed neutral string, prohibited claims, placeholder text, near-duplicate (dHash), CTA URL host and live status. A creative reaches
  READY_FOR_REVIEW only if every fail-level check passes; QA failures are shown with their reasons.
- Pilots: `scripts/ops/marketing-seed-pilots.ts` (facts quoted from each product's public page, public logos and screenshots, all marked for owner review) and
  `scripts/ops/marketing-pilot-run.ts` (concepts, then render jobs through the real queue).

## Video Studio (Phase 2)
- Storyboard from Product Truth (`video/queue.ts`), cards via the same template engine, real approved screenshots with zoom or pan motion, FFmpeg assembly with cross-transitions,
  burned captions (Liberation Sans, bottom 360 px kept clear), optional existing audio asset, output H.264 1080x1920 30 fps MP4.
- Video QA (`video/qa.ts`): plays and decodes cleanly, 1080x1920 h264 yuv420p, duration, size limit, no black or long frozen stretch, cards passed creative QA, CTA card readable,
  captions inside the safe area and grounded, media present and approved, audio valid and not silent where present.
- Rendering is OFF until an operator sets `ms_settings.video_enabled = true` after a passing benchmark.

## Benchmark
- `scripts/ops/marketing-benchmark-run.ts` queues the 15s, 30s and 60s benchmark jobs one at a time through the Studio queue.
- `scripts/ops/marketing-benchmark-monitor.mjs` (external, observe-only) samples GravyBlock, RentalNoodle, TheDrinkPlace, PostgreSQL, load, memory and disk every 2 seconds and writes the
  Studio `DISABLE` file on a breach (5xx or no response, latency over 4x baseline and over 1.5 s, PostgreSQL over 5x baseline and over 800 ms, memory under 700 MB, disk under 12 GB free).
- Results are stored in `ms_benchmark_runs` and shown on `/admin/marketing-studio`.
