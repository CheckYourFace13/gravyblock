# GravyBlock — Phase 1 discovery notes

## What was in the workspace

The `GravyBlock` folder on disk was **empty of prior legacy CMS exports or old runtime code** at the time this rebuild was executed (zero tracked files before scaffolding). Because of that, this document records **reverse engineering from product intent** (your brief) plus what was **implemented as the new source of truth** in this repository.

**Assumption:** Legacy assets (templates, prompts, sample JSON reports, exports) still exist elsewhere or were not copied into this workspace. If you add them later, re-run discovery against those files to align copy, scoring weights, and intake fields.

## Business model (inferred + preserved in product)

- **Core:** A local-growth system for hospitality SMBs — not a generic site builder.
- **Motion:** Free / low-friction scan → credible scored report → obvious human help path (consult / fulfillment).
- **Monetization intent:** Services, hybrid agency, or future SaaS; the app is structured to store **reports** and **leads** for follow-up and ops.

## UX map (implemented)

1. **Marketing:** Home + vertical pages (`/for-bars`, `/for-restaurants`, `/for-breweries`) → CTA to `/scan`.
2. **Intake:** `/scan` form captures business profile + optional GBP signals.
3. **Report:** `/report/[publicId]` renders structured JSON-shaped payload (brand, generatedAt, summary, business, sections, prioritized fixes).
4. **Lead capture:** CTA card on report stores a lead row (or memory dev store).
5. **Admin:** `/admin` lists activity; `/admin/reports`, `/admin/leads` for CRM-lite review.

## Report generation logic (implemented)

- **Pipeline:** `generateReportPayload` composes weighted section scores, issues, fixes, verdict copy, opportunity level.
- **Live signals:** Best-effort homepage fetch (HTTPS, title, meta description, viewport, tel links, map embed hints, JSON-LD hints, CTA language heuristics). Failures degrade gracefully into findings.
- **Data model:** `ReportPayload` mirrors the sample shape you described (`brand`, `generatedAt`, `summary.*`, `business.*`, `googleMapsUri`, sections).

## Lead funnel (implemented)

- Report page embeds a lead form tied to `reportPublicId`.
- Leads stored in Postgres (`leads` table) or in-memory when `DATABASE_URL` is unset.

## Reusable assets from “old GravyBlock”

**None found in-repo.** If you provide exports, prioritize:

- Any **sample report JSON** (lock tone + field names).
- **Homepage / pricing copy** (preserve promises and CTAs).
- **Form fields** actually used in the wild (align schema + validation).
- **Scoring rubrics** or spreadsheets (port weights into `src/lib/report/engine.ts`).

## Strong ideas worth keeping (from brief, encoded in code)

- Hospitality-first positioning (bars, restaurants, breweries).
- Consultant-style verdict tone (including the sample “Good foundation…” line on the homepage).
- Separation of **audit engine**, **conversion narrative**, and **sales handoff**.

## Baggage intentionally not carried forward

- Legacy CMS runtime coupling and ad-hoc PHP report pipelines.
- “SEO dashboard” framing; UI stays owner-readable.

## Blockers / missing assets

- No legacy files to diff against.
- **Google Business Profile / Places API** not wired yet — maps link and rating/reviews are manual intake today.
- **PDF export** not implemented (straightforward add-on: render route + print stylesheet or a PDF service).
- **Background jobs** not required yet; homepage fetch runs inline in the server action (tune with a queue if volume grows).

---

## 2026 platform upgrade (in-repo)

The codebase now models **persistent businesses**, **scan → report** history, **visibility snapshots**, **recommendation rows**, **content opportunities**, a **jobs** stub table, **plan tiers** on businesses, **pipeline status** on leads, a public **growth workspace** (`/workspace/[id]`), operator **admin/businesses** views, and typed **integration ports** (`src/lib/integrations/contracts.ts`). See `README.md` and `docs/INTEGRATIONS.md` for how new adapters should attach.
