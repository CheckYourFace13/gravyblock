# GravyBlock Site Connector Protocol (v1)

One generic action interface any site can implement once — WordPress, Webflow and Shopify are
existing *adapters* to this same interface (they call the platform's own API); a custom or
static site implements the interface directly via the **managed feed** connector described here.
Nothing about this protocol is specific to any one customer.

## Capability discovery

A connected site declares itself at:

```
GET /.well-known/gravyblock.json
→ { "connector": "gravyblock-managed", "version": 1, "businessId": "<uuid>" }
```

GravyBlock's `autoConnectManagedSites` batch (`src/lib/site-publish/adapters.ts`) polls every
business's own site for this marker and attaches it automatically — no dashboard step, no
API key exchange, no support ticket. The `businessId` in the marker must match the business
being connected, so a site can never be attached to the wrong account.

Every adapter (including WordPress/Webflow/Shopify) exposes the same `SiteCapabilities` record
(`src/lib/site-publish/adapters.ts`):

```ts
type SiteCapabilities = {
  articles: boolean;        // can publish new articles/pages
  pageMetadata: boolean;    // can set title/description per path
  socialImage: boolean;     // can set an og:image per path
  structuredData: boolean;  // can set JSON-LD per path
  existingPageBody: boolean; // can edit existing page body content
};
```

Engines read a business's `SiteTarget` (`getSiteTarget(businessId)`) and only propose actions
its capabilities actually support — never assume a capability exists.

## Authentication and signed requests

The managed feed is **pull-based and signed**, not push-based with a shared secret embedded in
the customer's code (which would need per-site secret provisioning and rotation):

1. GravyBlock signs the feed body with Ed25519 (`src/lib/site-publish/signing.ts`). The private
   key is derived deterministically from the existing `ADMIN_SECRET` via HMAC — no new secret
   to provision, store or rotate per customer.
2. The connected site embeds only the **public** key (34 bytes, safe to ship in a public repo)
   and fetches `GET /api/managed-site/<businessId>/feed`, verifying `x-gravyblock-signature`
   before trusting anything in the body. An unsigned, altered or unreachable feed is ignored —
   the site renders exactly as it would without the connector.
3. WordPress/Webflow/Shopify instead authenticate outbound, with the credential the customer
   authorized once (an Application Password, OAuth token, or Admin API token) — the *content
   contract* below is identical either way.

## Content contract (idempotent, reversible)

```json
{
  "version": 1,
  "businessId": "<uuid>",
  "generatedAt": "<iso>",
  "items": [
    { "slug": "...", "title": "...", "description": "...", "bodyHtml": "...", "coverImageUrl": "...", "publishedAt": "<iso>" }
  ],
  "overrides": [
    { "path": "/existing-page", "title": "...", "description": "...", "ogImage": "...", "jsonLd": { } }
  ]
}
```

- **`items`**: new content, one row per published article. The connected site renders these
  at a route it owns (e.g. `/insights/<slug>`); it is never asked to guess a route into the
  rest of the site's structure.
- **`overrides`**: per-path metadata patches (title/description/og:image/schema) for pages the
  site already has. Idempotent: replacing the same path's override again produces the same
  result. Removing the row (or its `status` moving to `reverted` server-side) removes it from
  the next feed fetch — the site always converges to GravyBlock's current desired state.

## Before-state, rollback, verification

Every write GravyBlock makes is recorded as a `site_override` (or `content_queue`/
`published_content`) row with the prior state implicit in "not present" — reverting is
inserting a new `site_override` row with `status: "reverted"`, never mutating history. After
any write:

1. GravyBlock re-fetches the **live** URL (never trusts the write API's own "success" response).
2. If the live page does not show the change within a grace window, the specific failing path
   is reverted individually (see `verifyBasicSeoActions` in `src/lib/seo/basic-autopilot.ts`) —
   a partial failure never blocks the pages that did apply.
3. Proof is written to the Proof Ledger only after this external verification succeeds.

## Rate limits

- Feed responses are cache-controlled (`s-maxage=30, stale-while-revalidate=120`) so a
  connected site never needs to poll more than roughly every 30 seconds.
- Per-business write volume is bounded the same way regardless of adapter: at most one
  SEO-defect-class action per 28-day cooldown per page (`COOLDOWN_DAYS` in
  `basic-autopilot.ts`), and content publishing is capped by the existing content-queue depth
  limit.

## Adapters implementing this interface today

| Adapter | Auth | Capabilities |
|---|---|---|
| `wordpress` | Application Password (one-time) | articles, pageMetadata, structuredData, existingPageBody |
| `webflow` | CMS API token (one-time) | articles |
| `shopify` | Admin API token (one-time) | articles |
| `managed_feed` | Ed25519 signature (no per-site secret) | articles, pageMetadata, socialImage, structuredData |

A future adapter (a GitHub-commit connector, a Wix/Squarespace app, a headless CMS) is added by
implementing this same capability set — no engine changes.

## Minimal integration checklist (any Next.js site)

Proven three times (Boating Chicago, LeaguePour, SeeStew) with the identical steps and zero
site-specific engine code on GravyBlock's side:

1. Add `src/lib/gravyblock-managed.ts` — `getManagedFeed()` (fetch + Ed25519 verify) and
   `applyManagedMetadata(path, base)`. ~70 lines, no dependencies beyond Node's built-in `crypto`.
2. Add `src/app/.well-known/gravyblock.json/route.ts` — a static route returning
   `{ connector: "gravyblock-managed", version: 1, businessId: "<this business's id>" }`. This is
   the one piece of per-site config (the business id), exactly like a site storing its own
   analytics ID — not GravyBlock engine logic.
3. Wrap each page's `generateMetadata` return in `applyManagedMetadata(path, { ...existing })`
   (full coverage is ideal; even wrapping only the highest-traffic templates — the homepage and
   the main content-detail page — lets basic-page-SEO actions apply immediately).
4. Optional: add `src/app/insights/[slug]/page.tsx` (+ index page) so GravyBlock can publish new
   articles, and list `getManagedFeed()` items in `sitemap.ts`.

Nothing here requires GravyBlock credentials on the site, a build-time secret, or a webhook back
to GravyBlock — it is a public, signed, read-only fetch. `autoConnectManagedSites` finds and
attaches the site automatically on its next run once step 2 is live.
