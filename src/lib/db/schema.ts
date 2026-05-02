import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  accountType: text("account_type").notNull().default("single_business"),
  planTier: text("plan_tier").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  website: text("website"),
  websiteNormalized: text("website_normalized"),
  businessModel: text("business_model").notNull().default("single_location"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  locationType: text("location_type").notNull().default("physical"),
  address: text("address"),
  city: text("city"),
  stateRegion: text("state_region"),
  country: text("country"),
  postalCode: text("postal_code"),
  placeId: text("place_id"),
  website: text("website"),
  websitePath: text("website_path"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  stripeSubscriptionItemId: text("stripe_subscription_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const websiteDomains = pgTable("website_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  role: text("role").notNull().default("primary"),
  cmsTarget: text("cms_target").default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Subscription / fulfillment tier — used for feature gating (see `src/lib/plans.ts`). */
export const businesses = pgTable("businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  name: text("name").notNull(),
  vertical: text("vertical"),
  businessModel: text("business_model").notNull().default("single_location"),
  ownershipModel: text("ownership_model").notNull().default("independent"),
  placeId: text("place_id"),
  primaryCategory: text("primary_category"),
  address: text("address"),
  website: text("website"),
  /** Lowercased origin for dedupe lookups (optional). */
  websiteNormalized: text("website_normalized"),
  phone: text("phone"),
  googleMapsUri: text("google_maps_uri"),
  rating: text("rating"),
  reviewCount: integer("review_count"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  businessStatus: text("business_status"),
  brandNotes: text("brand_notes"),
  /**
   * Focus area for this business: local | regional | national | online
   * Drives content gen scope and which features are relevant.
   */
  focusArea: text("focus_area").notNull().default("local"),
  /**
   * Human-readable scope string: city name, state, country, or blank for worldwide.
   * e.g. "Austin, TX" | "Texas" | "United States" | ""
   */
  targetScope: text("target_scope"),
  planTier: text("plan_tier").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"),
  billingEmail: text("billing_email"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** Yelp business alias/id — auto-discovered on first review sync */
  yelpBusinessId: text("yelp_business_id"),
  /** TripAdvisor location id — auto-discovered on first review sync */
  tripAdvisorLocationId: text("trip_advisor_location_id"),
});

/** Each visibility run (free scan, rescan, future scheduled job). */
export const scans = pgTable("scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  source: text("source").notNull().default("free_scan"),
  lookupQuery: text("lookup_query"),
  lookupLocation: text("lookup_location"),
  selectedPlaceId: text("selected_place_id"),
  placeConfidence: integer("place_confidence"),
  sourcesUsed: jsonb("sources_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Snapshot of Google Place data captured at scan time. */
export const placeProfiles = pgTable("place_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("google_places"),
  placeId: text("place_id").notNull(),
  displayName: text("display_name").notNull(),
  formattedAddress: text("formatted_address"),
  internationalPhoneNumber: text("international_phone_number"),
  websiteUri: text("website_uri"),
  mapsUri: text("maps_uri"),
  rating: text("rating"),
  reviewCount: integer("review_count"),
  primaryType: text("primary_type"),
  types: jsonb("types"),
  businessStatus: text("business_status"),
  openNow: text("open_now"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Social URLs discovered from public homepage / structured data at scan time (not platform analytics). */
export const socialProfiles = pgTable("social_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  url: text("url").notNull(),
  handle: text("handle"),
  discoverySource: text("discovery_source").notNull(),
  confidence: integer("confidence").notNull().default(70),
  activityHint: text("activity_hint").notNull().default("unknown"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Optional owner-authorized Search Console linkage. */
export const searchConsolePropertyConnections = pgTable("search_console_property_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  propertyUri: text("property_uri").notNull(),
  status: text("status").notNull().default("connected"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Unified Google OAuth connection per business — covers Search Console + GBP. */
export const googleOauthConnections = pgTable("google_oauth_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scopes: text("scopes").notNull(),
  googleEmail: text("google_email"),
  searchConsoleProperty: text("search_console_property"),
  gbpAccountId: text("gbp_account_id"),
  gbpLocationName: text("gbp_location_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Public shareable report for a single scan. */
export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  publicId: text("public_id").notNull().unique(),
  scanId: uuid("scan_id")
    .references(() => scans.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  payload: jsonb("payload").notNull(),
  overallScore: integer("overall_score").notNull(),
  opportunityLevel: text("opportunity_level").notNull(),
  sourceAttribution: jsonb("source_attribution"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Point-in-time scores for trend charts (Layer 2). */
export const visibilitySnapshots = pgTable("visibility_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "cascade" }),
  overallScore: integer("overall_score").notNull(),
  opportunityLevel: text("opportunity_level").notNull(),
  sectionScores: jsonb("section_scores").notNull(),
  source: text("source").notNull().default("scan"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Verified and estimated ranking checks captured per scan. */
export const rankingChecks = pgTable("ranking_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  source: text("source").notNull(),
  metricType: text("metric_type").notNull(),
  estimatedPosition: integer("estimated_position"),
  averagePosition: doublePrecision("average_position"),
  impressions: integer("impressions"),
  clicks: integer("clicks"),
  ctr: doublePrecision("ctr"),
  inTop3: text("in_top3"),
  mapPack: text("map_pack"),
  confidence: integer("confidence"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const auditFindings = pgTable("audit_findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  source: text("source").notNull(),
  estimated: text("estimated").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const competitorSnapshots = pgTable("competitor_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  scanId: uuid("scan_id").references(() => scans.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  competitorName: text("competitor_name").notNull(),
  competitorPlaceId: text("competitor_place_id"),
  rating: text("rating"),
  reviewCount: integer("review_count"),
  estimatedPosition: integer("estimated_position"),
  source: text("source").notNull().default("estimated_local_rank"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const businessCompetitors = pgTable("business_competitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  website: text("website"),
  placeId: text("place_id"),
  category: text("category"),
  source: text("source").notNull().default("manual"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Autopilot queue — materialized from scan output; editable in admin later. */
export const recommendations = pgTable("recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
  lane: text("lane").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  impact: text("impact").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentOpportunities = pgTable("content_opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  reportId: uuid("report_id").references(() => reports.id, { onDelete: "set null" }),
  angle: text("angle").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const growthPrograms = pgTable("growth_programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  goal: text("goal").notNull(),
  cadence: text("cadence").notNull().default("monthly"),
  status: text("status").notNull().default("active"),
  automationMode: text("automation_mode").notNull().default("assisted"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentStrategies = pgTable("content_strategies", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  strategyWindowDays: integer("strategy_window_days").notNull().default(30),
  audience: text("audience"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const contentQueue = pgTable("content_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  strategyId: uuid("strategy_id").references(() => contentStrategies.id, { onDelete: "set null" }),
  kind: text("kind").notNull().default("article"),
  title: text("title").notNull(),
  outline: text("outline"),
  targetKeyword: text("target_keyword"),
  targetUrl: text("target_url"),
  variant: text("variant").notNull().default("default"),
  status: text("status").notNull().default("queued"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publishingTargets = pgTable("publishing_targets", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  adapter: text("adapter").notNull().default("manual"),
  config: jsonb("config"),
  active: text("active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publishingJobs = pgTable("publishing_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  queueId: uuid("queue_id").references(() => contentQueue.id, { onDelete: "cascade" }),
  targetId: uuid("target_id").references(() => publishingTargets.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  responseLog: text("response_log"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publishedContent = pgTable("published_content", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  queueId: uuid("queue_id").references(() => contentQueue.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  channel: text("channel").notNull().default("internal_site"),
  publicUrl: text("public_url"),
  status: text("status").notNull().default("published"),
  // Feature #5: article cover image from Unsplash
  coverImageUrl: text("cover_image_url"),
  coverImageCredit: text("cover_image_credit"),
  // Feature #2: auto-generated SEO meta tags
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const backlinkOpportunities = pgTable("backlink_opportunities", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull().default("partner"),
  targetUrl: text("target_url"),
  relevanceNote: text("relevance_note"),
  qualityScore: integer("quality_score"),
  status: text("status").notNull().default("prospecting"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const authorityCampaigns = pgTable("authority_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  objective: text("objective").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const aiVisibilityChecks = pgTable("ai_visibility_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  prompt: text("prompt").notNull(),
  engine: text("engine").notNull().default("synthetic"),
  mentionFound: text("mention_found").notNull().default("false"),
  sentiment: text("sentiment"),
  citationUrl: text("citation_url"),
  confidence: integer("confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const citationMonitors = pgTable("citation_monitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  sourceName: text("source_name").notNull(),
  listingUrl: text("listing_url"),
  status: text("status").notNull().default("pending"),
  mismatchNote: text("mismatch_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const operatorTasks = pgTable("operator_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  detail: text("detail"),
  queue: text("queue").notNull().default("general"),
  status: text("status").notNull().default("queued"),
  assignee: text("assignee"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const operatorNotes = pgTable("operator_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Stub job queue for future workers (GBP sync, crawl, AI visibility checks). */
export const jobs = pgTable("jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  status: text("status").notNull().default("pending"),
  runAfter: timestamp("run_after", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "set null" }),
  reportPublicId: text("report_public_id"),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  website: text("website"),
  websiteNormalized: text("website_normalized"),
  placeId: text("place_id"),
  phone: text("phone"),
  message: text("message"),
  vertical: text("vertical"),
  source: text("source").notNull().default("contact_form"),
  sources: jsonb("sources"),
  pipelineStatus: text("pipeline_status").notNull().default("new"),
});

export const customerMagicLinks = pgTable("customer_magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  redirectTo: text("redirect_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const customerSessions = pgTable("customer_sessions", {
  id: text("id").primaryKey(),
  emailNormalized: text("email_normalized").notNull(),
  businessIds: jsonb("business_ids").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Owner-supplied configuration for autopilot context.
 * Populated via /setup/[token] email link, or auto-scraped from website/social.
 */
export const businessConfigs = pgTable("business_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  /** How this config was populated. */
  source: text("source").notNull().default("owner_form"),
  focusArea: text("focus_area").notNull().default("local"),
  targetScope: text("target_scope"),
  targetKeywords: text("target_keywords"),
  targetCities: text("target_cities"),
  serviceDescription: text("service_description"),
  uniqueSellingPoints: text("unique_selling_points"),
  tone: text("tone").notNull().default("professional"),
  competitorNames: text("competitor_names"),
  instagramHandle: text("instagram_handle"),
  facebookUrl: text("facebook_url"),
  tiktokHandle: text("tiktok_handle"),
  youtubeUrl: text("youtube_url"),
  linkedinUrl: text("linkedin_url"),
  additionalContext: text("additional_context"),
  // Feature #3: brand voice — describe writing style, personality, tone examples
  brandVoice: text("brand_voice"),
  // Feature #9: Facebook/Instagram API credentials (stored per-business)
  facebookPageId: text("facebook_page_id"),
  facebookAccessToken: text("facebook_access_token"),
  instagramAccountId: text("instagram_account_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Reviews fetched from Google, Yelp, TripAdvisor, etc. with AI-generated reply suggestions. */
export const businessReviews = pgTable("business_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  /** Platform-agnostic external ID. Format: google:{placeId}:{time}:{author}, yelp:{id}, ta:{id} */
  googleReviewId: text("google_review_id").notNull(),
  /** Source platform: google | yelp | tripadvisor */
  source: text("source").notNull().default("google"),
  authorName: text("author_name"),
  authorPhotoUri: text("author_photo_uri"),
  rating: integer("rating").notNull(),
  text: text("text"),
  publishTime: timestamp("publish_time", { withTimezone: true }),
  suggestedReply: text("suggested_reply"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Feature #1: Keyword Rankings from Google Search Console ─────────────────
export const keywordRankings = pgTable("keyword_rankings", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id").references(() => businesses.id, { onDelete: "cascade" }).notNull(),
  keyword: text("keyword").notNull(),
  position: text("position"),          // avg position (decimal, stored as text)
  clicks: integer("clicks").default(0),
  impressions: integer("impressions").default(0),
  ctr: text("ctr"),                    // 0–1, stored as text
  date: text("date").notNull(),        // YYYY-MM-DD
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Single-use token links emailed to business owners for no-login setup. */
export const setupTokens = pgTable("setup_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  businessId: uuid("business_id")
    .references(() => businesses.id, { onDelete: "cascade" })
    .notNull(),
  token: text("token").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
