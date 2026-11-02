/**
 * Marketing Studio schema (Phase 1). ADDITIVE ONLY: every table is new and prefixed `ms_`, nothing here alters or
 * depends on existing GravyBlock behavior. The studio worker connects as the least-privilege `gb_studio` role, which can
 * write only these tables (see scripts/ops/marketing-db-grants.sh), so a bug cannot write a business, a site or the
 * proof ledger. Governing design: docs/marketing-studio/PHASE0-audit-and-plan.md.
 *
 * Ownership model:
 *   owner_kind 'internal' | 'house'  -> visible only to the internal (operator) scope
 *   owner_kind 'customer'            -> visible only to the customer scope of the same organization_id
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { businesses } from "./schema";

export const msProducts = pgTable(
  "ms_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** internal | house | customer */
    ownerKind: text("owner_kind").notNull().default("internal"),
    /** Required when owner_kind = customer. No FK so the studio never depends on organization rows. */
    organizationId: uuid("organization_id"),
    /** Optional link when the product is also a GravyBlock business (for example a House Account). Read-only reference. */
    businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
    /** website | saas | mobile_app | web_game | mobile_game */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    /** draft | active | paused | archived */
    status: text("status").notNull().default("draft"),
    publicUrl: text("public_url"),
    createdBy: text("created_by").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("ms_products_owner_slug_idx").on(t.ownerKind, t.organizationId, t.slug),
    index("ms_products_owner_idx").on(t.ownerKind, t.organizationId),
  ],
);

export const msBrandProfiles = pgTable(
  "ms_brand_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    version: integer("version").notNull().default(1),
    colors: jsonb("colors").notNull().default({}),
    fonts: jsonb("fonts").notNull().default({}),
    logoAssetId: uuid("logo_asset_id"),
    voiceRules: text("voice_rules"),
    doNotSay: text("do_not_say"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ms_brand_profiles_product_version_idx").on(t.productId, t.version)],
);

/** Verified facts every generated claim must trace to. Mirrors business_facts semantics with product keys. */
export const msProductFacts = pgTable(
  "ms_product_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    /** product_name | tagline | description | platform | store_url | website_url | feature | audience | pricing | release_version | cta ... */
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    /** public_page | store_listing | owner_entered | asset_metadata */
    sourceKind: text("source_kind").notNull(),
    sourceUrl: text("source_url"),
    contentHash: text("content_hash").notNull(),
    /** current | superseded | expired */
    status: text("status").notNull().default("current"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ms_product_facts_product_status_idx").on(t.productId, t.status)],
);

export const msClaims = pgTable(
  "ms_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    /** approved | prohibited */
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    /** Approved claims must cite the facts that support them. */
    factIds: jsonb("fact_ids").notNull().default([]),
    rationale: text("rationale"),
    addedBy: text("added_by").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ms_claims_product_idx").on(t.productId, t.kind)],
);

/** Brand and media asset METADATA plus the local file location. Phase 1 stores files but renders nothing. */
export const msAssets = pgTable(
  "ms_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    /** logo | screenshot | icon | gameplay_capture | app_capture | font | audio | other */
    kind: text("kind").notNull(),
    /** Path relative to the media root, never absolute, never user-supplied. */
    storagePath: text("storage_path").notNull(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    originalName: text("original_name"),
    /** owner_upload | public_fetch */
    provenance: text("provenance").notNull(),
    sourceUrl: text("source_url"),
    /** Only approved assets may ever be used as footage or imagery. */
    approved: text("approved").notNull().default("false"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    licenseNote: text("license_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("ms_assets_product_sha_idx").on(t.productId, t.sha256), index("ms_assets_product_idx").on(t.productId)],
);

/** Campaign RECORDS. Phase 1 plans and stores them; nothing is generated or published. */
export const msCampaigns = pgTable(
  "ms_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    name: text("name").notNull(),
    objective: text("objective").notNull(),
    audience: text("audience"),
    channels: jsonb("channels").notNull().default([]),
    /** draft | needs_review | approved | scheduled | live | complete | cancelled */
    status: text("status").notNull().default("draft"),
    /** 1 manual generation + approval, 2 automatic generation + approval, 3 bounded autopilot (not enabled in Phase 1). */
    automationLevel: integer("automation_level").notNull().default(1),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    notes: text("notes"),
    createdBy: text("created_by").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ms_campaigns_product_idx").on(t.productId, t.status)],
);

/** The studio queue. Independent of the shared `jobs` table so media work never pollutes budget and hold queries. */
export const msMediaJobs = pgTable(
  "ms_media_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }),
    /** noop_probe | storage_audit | cleanup_tmp (Phase 1). Render kinds arrive in later phases. */
    kind: text("kind").notNull(),
    /** light | heavy. Heavy runs one at a time. */
    weight: text("weight").notNull().default("light"),
    priority: integer("priority").notNull().default(5),
    /** queued | running | done | failed | dead | cancelled */
    status: text("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lockedBy: text("locked_by"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /** Idempotency: the same logical job is enqueued once. */
    dedupeKey: text("dedupe_key"),
    input: jsonb("input").notNull().default({}),
    output: jsonb("output"),
    error: text("error"),
    wallMs: integer("wall_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ms_media_jobs_claim_idx").on(t.status, t.runAfter, t.priority),
    uniqueIndex("ms_media_jobs_dedupe_idx").on(t.dedupeKey),
  ],
);

/**
 * Credential REFERENCES for future platform connections. The secret is stored only as AES-256-GCM ciphertext; the key
 * lives in the environment, never in the database. Phase 1 connects nothing.
 */
export const msConnections = pgTable(
  "ms_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }).notNull(),
    /** youtube | facebook | instagram | tiktok */
    platform: text("platform").notNull(),
    accountLabel: text("account_label").notNull(),
    externalAccountId: text("external_account_id"),
    scopes: jsonb("scopes").notNull().default([]),
    /** base64(iv | tag | ciphertext). Never plaintext. */
    secretCiphertext: text("secret_ciphertext").notNull(),
    keyId: text("key_id").notNull(),
    /** connected | expired | revoked | error */
    status: text("status").notNull().default("connected"),
    authorizedBy: text("authorized_by").notNull(),
    authorizedAt: timestamp("authorized_at", { withTimezone: true }).defaultNow().notNull(),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  },
  (t) => [index("ms_connections_product_idx").on(t.productId, t.platform)],
);

export const msUsage = pgTable(
  "ms_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id").references(() => msProducts.id, { onDelete: "cascade" }),
    /** YYYY-MM for monthly resources, YYYY-MM-DD for daily ones. */
    period: text("period").notNull(),
    /** llm_usd | llm_tokens | cpu_seconds | render_seconds | disk_bytes | api_calls | jobs_run */
    resource: text("resource").notNull(),
    amount: integer("amount").notNull().default(0),
    cap: integer("cap"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ms_usage_period_idx").on(t.period, t.resource)],
);

/** Global studio settings: enabled flag, kill switch, worker heartbeat, limits. One row per key. */
export const msSettings = pgTable("ms_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Append-only audit trail for approvals, enrollment, connections, settings and deletions. */
export const msAuditEvents = pgTable(
  "ms_audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    productId: uuid("product_id"),
    detail: jsonb("detail").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("ms_audit_events_product_idx").on(t.productId, t.at)],
);
