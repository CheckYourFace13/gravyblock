/**
 * Connection readiness: what GravyBlock detected about a customer's setup
 * WITHOUT asking them, and which engines are running vs. waiting on a single
 * one-time authorization.
 *
 * Semantic contract: a missing integration only marks the engines that depend
 * on it. No Facebook never stops SEO/content/backlinks; no Google never stops
 * the watchdog, citations or truth. Everything else stays "running".
 *
 * Everything except the (network-bound) publishing-platform fingerprint is
 * computed live from the database on every call, so a customer who just
 * connected something sees it immediately. The fingerprint result is cached in
 * the persisted `connection_readiness` job row (at most one row per 6 hours).
 */

import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { businessConfigs, businesses, citationListings, getDb, googleOauthConnections, jobs, publishingTargets } from "@/lib/db";
import { safeFetchText } from "@/lib/net/safe-fetch";
import { ensureFreshTruth, getBusinessTruth } from "@/lib/truth";

export type EngineId =
  | "content"
  | "seo_existing_pages"
  | "gbp"
  | "social"
  | "reviews_replies"
  | "review_requests"
  | "authority"
  | "citations"
  | "competitor"
  | "technical"
  | "aeo";

export type EngineStatus = "running" | "needs_one_time_authorization" | "unavailable";

export type OneTimeActionKind =
  | "connect_publishing"
  | "connect_google"
  | "connect_facebook"
  | "confirm_location"
  | "connect_customer_feed"
  | "verify_directory";

export type OneTimeAction = { label: string; kind: OneTimeActionKind; href?: string };

export type EngineReadiness = {
  engine: EngineId;
  status: EngineStatus;
  reason: string;
  oneTimeAction?: OneTimeAction;
};

export type NeedsYouItem = { id: string; label: string; why: string; href: string; kind: OneTimeActionKind };

export type DetectedPlatform = "wordpress" | "shopify" | "webflow" | "wix" | "squarespace" | "unknown" | "none";

export type ConnectionReadiness = {
  businessId: string;
  detectedPlatform: DetectedPlatform;
  publishingConnected: boolean;
  google: {
    connected: boolean;
    hasBusinessScope: boolean;
    hasSearchConsoleScope: boolean;
    searchConsoleProperty: string | null;
    gbpLocationName: string | null;
    placeMatched: boolean;
  };
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  locationKnown: boolean;
  reviewFeedConnected: boolean;
  engines: EngineReadiness[];
  needsYou: NeedsYouItem[];
};

const SIX_HOURS = 6 * 3_600_000;
const SUPPORTED_PUBLISHERS: DetectedPlatform[] = ["wordpress", "shopify", "webflow"];

/* ─── Platform detection ─────────────────────────────────────────────────── */

export async function detectPublishingPlatform(website: string | null | undefined): Promise<DetectedPlatform> {
  if (!website || !website.trim()) return "none";
  try {
    const home = await safeFetchText(website, { timeoutMs: 8000, maxBytes: 600_000 });
    if (home.ok && home.status < 400) {
      const html = home.body.toLowerCase();
      if (/wp-content|wp-includes|<meta[^>]+name=["']generator["'][^>]+wordpress/.test(html)) return "wordpress";
      if (/cdn\.shopify\.com|shopify\.theme|myshopify\.com/.test(html)) return "shopify";
      if (/data-wf-site|webflow\.com|assets-global\.website-files\.com/.test(html)) return "webflow";
      if (/wixstatic\.com|static\.parastorage\.com/.test(html)) return "wix";
      if (/squarespace/.test(html)) return "squarespace";
    }
    const origin = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).origin;
    const wp = await safeFetchText(`${origin}/wp-json/`, { timeoutMs: 6000, maxBytes: 100_000, accept: "application/json" });
    if (wp.ok && wp.status === 200 && /^\s*\{/.test(wp.body) && /"namespaces"|"routes"/.test(wp.body)) return "wordpress";
  } catch {
    /* fall through */
  }
  return "unknown";
}

/* ─── Core computation ───────────────────────────────────────────────────── */

type CachedDetection = { platform: DetectedPlatform; website: string; at: number };

async function lastReadinessJob(businessId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "connection_readiness")))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  return row ?? null;
}

function cachedDetectionFrom(row: { createdAt: Date; payload: unknown } | null): CachedDetection | null {
  if (!row || Date.now() - row.createdAt.getTime() > SIX_HOURS) return null;
  const p = row.payload as { detectedPlatform?: DetectedPlatform; website?: string } | null;
  if (!p?.detectedPlatform) return null;
  return { platform: p.detectedPlatform, website: p.website ?? "", at: row.createdAt.getTime() };
}

function hostOf(url: string): string {
  return url.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}

export async function getConnectionReadiness(businessId: string, opts: { freshTruth?: boolean } = {}): Promise<ConnectionReadiness> {
  const db = getDb();
  const empty: ConnectionReadiness = {
    businessId,
    detectedPlatform: "none",
    publishingConnected: false,
    google: { connected: false, hasBusinessScope: false, hasSearchConsoleScope: false, searchConsoleProperty: null, gbpLocationName: null, placeMatched: false },
    facebookConfigured: false,
    instagramConfigured: false,
    locationKnown: false,
    reviewFeedConnected: false,
    engines: [],
    needsYou: [],
  };
  if (!db) return empty;

  const [biz] = await db
    .select({
      id: businesses.id,
      website: businesses.website,
      placeId: businesses.placeId,
      targetScope: businesses.targetScope,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) return empty;

  const [config] = await db.select().from(businessConfigs).where(eq(businessConfigs.businessId, businessId)).limit(1);
  const [google] = await db.select().from(googleOauthConnections).where(eq(googleOauthConnections.businessId, businessId)).limit(1);
  const targets = await db
    .select({ adapter: publishingTargets.adapter, active: publishingTargets.active })
    .from(publishingTargets)
    .where(eq(publishingTargets.businessId, businessId));
  const listings = await db
    .select({ directoryName: citationListings.directoryName })
    .from(citationListings)
    .where(and(eq(citationListings.businessId, businessId), eq(citationListings.status, "needs_one_time_verification")));

  let truth: Awaited<ReturnType<typeof getBusinessTruth>> | null = null;
  try {
    truth = opts.freshTruth ? await ensureFreshTruth(businessId) : await getBusinessTruth(businessId);
  } catch {
    truth = null;
  }

  // Platform detection: cached for 6h per website, otherwise a real fetch.
  const lastJob = await lastReadinessJob(businessId).catch(() => null);
  const cached = cachedDetectionFrom(lastJob);
  const website = biz.website?.trim() ?? "";
  let detectedPlatform: DetectedPlatform;
  if (!website) detectedPlatform = "none";
  else if (cached && hostOf(cached.website) === hostOf(website)) detectedPlatform = cached.platform;
  else detectedPlatform = await detectPublishingPlatform(website);

  const activeTargets = targets.filter((t) => t.active === "true");
  const activeSupported = activeTargets.filter((t) => SUPPORTED_PUBLISHERS.includes(t.adapter as DetectedPlatform));
  const publishingConnected = activeSupported.length > 0;

  const scopes = google?.scopes ?? "";
  const g = {
    connected: Boolean(google),
    hasBusinessScope: scopes.includes("business.manage"),
    hasSearchConsoleScope: scopes.includes("webmasters"),
    searchConsoleProperty: google?.searchConsoleProperty ?? null,
    gbpLocationName: google?.gbpLocationName ?? null,
    placeMatched: Boolean(biz.placeId),
  };
  const facebookConfigured = Boolean(config?.facebookPageId && config?.facebookAccessToken);
  const instagramConfigured = Boolean(config?.instagramAccountId && config?.facebookAccessToken);
  const reviewFeedConnected = Boolean(config?.transactionsToken);
  const locationKnown = Boolean(
    truth?.verifiedCity ||
      config?.targetScope?.trim() ||
      config?.serviceAddress?.trim() ||
      biz.targetScope?.trim(),
  );

  const ws = `/workspace/${businessId}`;
  const hrefPublishing = `${ws}#publishing-connect`;
  const hrefGoogle = `${ws}#google-connect`;
  const hrefFacebook = `${ws}#social-connect`;
  const hrefLocation = `${ws}#business-profile`;

  const engines: EngineReadiness[] = [];
  const truthOk = Boolean(truth?.sufficient);

  // content
  if (!website) {
    engines.push({ engine: "content", status: "unavailable", reason: "No website on file to publish to." });
  } else if (publishingConnected) {
    engines.push(
      truthOk
        ? { engine: "content", status: "running", reason: "Publishing to your connected website." }
        : { engine: "content", status: "running", reason: "Connected; waiting until your site has enough of its own information to write from." },
    );
  } else if (detectedPlatform === "wix" || detectedPlatform === "squarespace") {
    engines.push({
      engine: "content",
      status: "unavailable",
      reason: `Your site looks like ${detectedPlatform === "wix" ? "Wix" : "Squarespace"}; GravyBlock publishes to WordPress, Webflow and Shopify only.`,
    });
  } else {
    const nice = detectedPlatform === "unknown" ? "your website" : detectedPlatform[0].toUpperCase() + detectedPlatform.slice(1);
    engines.push({
      engine: "content",
      status: "needs_one_time_authorization",
      reason: detectedPlatform === "unknown" ? "Connect your website once so articles and service pages can go live." : `We detected ${nice}. Connect it once so articles and service pages can go live.`,
      oneTimeAction: { label: detectedPlatform === "unknown" ? "Connect your website" : `Connect your ${nice} site`, kind: "connect_publishing", href: hrefPublishing },
    });
  }

  // seo_existing_pages: not built (see capabilities.ts existing_page_optimization)
  engines.push({ engine: "seo_existing_pages", status: "unavailable", reason: "Automatic edits to existing pages are not offered yet." });

  // gbp
  if (g.connected && g.hasBusinessScope && g.gbpLocationName) {
    engines.push({ engine: "gbp", status: "running", reason: "Google Business Profile posts and photos are connected." });
  } else if (g.connected && g.hasBusinessScope) {
    engines.push({
      engine: "gbp",
      status: "needs_one_time_authorization",
      reason: "Google is connected but no Business Profile location was found on the account.",
      oneTimeAction: { label: "Reconnect Google with the account that owns your profile", kind: "connect_google", href: hrefGoogle },
    });
  } else {
    engines.push({
      engine: "gbp",
      status: "needs_one_time_authorization",
      reason: g.connected ? "Google is connected without Business Profile permission." : "Connect Google once for Business Profile posts, photos and review replies.",
      oneTimeAction: { label: g.connected ? "Reconnect Google and allow Business Profile" : "Connect Google", kind: "connect_google", href: hrefGoogle },
    });
  }
  const gbpEngine = engines[engines.length - 1];

  // social
  engines.push(
    facebookConfigured
      ? { engine: "social", status: "running", reason: instagramConfigured ? "Posting to your Facebook Page and Instagram." : "Posting to your Facebook Page." }
      : {
          engine: "social",
          status: "needs_one_time_authorization",
          reason: "Connect your Facebook Page once to post there and to Instagram.",
          oneTimeAction: { label: "Connect Facebook Page", kind: "connect_facebook", href: hrefFacebook },
        },
  );

  // reviews_replies (depends on the same Google authorization as gbp)
  engines.push(
    gbpEngine.status === "running"
      ? { engine: "reviews_replies", status: "running", reason: "Monitoring reviews and replying to Google reviews." }
      : { engine: "reviews_replies", status: "needs_one_time_authorization", reason: "Posting Google review replies needs the same Google connection.", oneTimeAction: gbpEngine.oneTimeAction },
  );

  // review_requests
  engines.push(
    reviewFeedConnected
      ? { engine: "review_requests", status: "running", reason: "Review requests go to customers your own system reports as completed." }
      : {
          engine: "review_requests",
          status: "needs_one_time_authorization",
          reason: "GravyBlock only asks real completed customers for reviews. Connect the feed from your booking or invoicing system once.",
          oneTimeAction: { label: "Connect your customer feed", kind: "connect_customer_feed", href: ws },
        },
  );

  // authority / citations / competitor need location identity (and site facts)
  const needsLocation = (engine: EngineId, runningReason: string): EngineReadiness => {
    if (!website) return { engine, status: "unavailable", reason: "No website on file." };
    if (!locationKnown && !truthOk) {
      return {
        engine,
        status: "needs_one_time_authorization",
        reason: "We could not confirm your city or service area from your website.",
        oneTimeAction: { label: "Confirm your location", kind: "confirm_location", href: hrefLocation },
      };
    }
    return { engine, status: "running", reason: runningReason };
  };
  engines.push(needsLocation("authority", "Finding local organizations and pitching pages from your own website."));
  engines.push(needsLocation("citations", "Checking your name, phone and address across directories."));

  // competitor (map rankings against local competitors) needs a matched Google place
  engines.push(
    g.placeMatched
      ? { engine: "competitor", status: "running", reason: "Tracking local map rankings against competitors." }
      : {
          engine: "competitor",
          status: "needs_one_time_authorization",
          reason: "No confident Google Maps match for your business yet.",
          oneTimeAction: { label: "Confirm your Google Maps listing", kind: "confirm_location", href: hrefLocation },
        },
  );

  // technical (website watchdog) and aeo only need the website
  engines.push(website ? { engine: "technical", status: "running", reason: "Weekly website health checks." } : { engine: "technical", status: "unavailable", reason: "No website on file." });
  engines.push(website ? { engine: "aeo", status: "running", reason: "Monthly AI-assistant visibility checks." } : { engine: "aeo", status: "unavailable", reason: "No website on file." });

  const readiness: ConnectionReadiness = {
    businessId,
    detectedPlatform,
    publishingConnected,
    google: g,
    facebookConfigured,
    instagramConfigured,
    locationKnown,
    reviewFeedConnected,
    engines,
    needsYou: [],
  };
  readiness.needsYou = buildNeedsYou(readiness, listings.map((l) => l.directoryName));

  // Persist at most once per 6 hours (also refreshes the platform cache).
  try {
    if (!lastJob || Date.now() - lastJob.createdAt.getTime() > SIX_HOURS) {
      await db.insert(jobs).values({
        businessId,
        type: "connection_readiness",
        status: "completed",
        payload: { engines, needsYou: readiness.needsYou, detectedPlatform, website },
      });
    }
  } catch (err) {
    console.error("[connection-readiness] persist failed", err);
  }

  return readiness;
}

/* ─── Needs-you list ─────────────────────────────────────────────────────── */

const KIND_PRIORITY: OneTimeActionKind[] = [
  "connect_publishing",
  "connect_google",
  "confirm_location",
  "connect_facebook",
  "verify_directory",
  "connect_customer_feed",
];

const ENGINE_NAMES: Record<EngineId, string> = {
  content: "website articles and pages",
  seo_existing_pages: "existing-page edits",
  gbp: "Google Business Profile posts",
  social: "Facebook and Instagram posting",
  reviews_replies: "Google review replies",
  review_requests: "review requests",
  authority: "local link outreach",
  citations: "listing consistency checks",
  competitor: "competitor ranking checks",
  technical: "website checks",
  aeo: "AI visibility checks",
};

function buildNeedsYou(r: ConnectionReadiness, pendingDirectories: string[]): NeedsYouItem[] {
  const byKind = new Map<OneTimeActionKind, { action: OneTimeAction; engines: EngineId[] }>();
  for (const e of r.engines) {
    if (e.status !== "needs_one_time_authorization" || !e.oneTimeAction) continue;
    const cur = byKind.get(e.oneTimeAction.kind);
    if (cur) cur.engines.push(e.engine);
    else byKind.set(e.oneTimeAction.kind, { action: e.oneTimeAction, engines: [e.engine] });
  }

  const CONNECT_COPY: Partial<Record<OneTimeActionKind, string>> = {
    connect_google: "Unlocks Google Business Profile posting, review replies and Search Console measurement.",
    connect_publishing: "Lets GravyBlock safely publish and improve eligible pages automatically.",
    connect_facebook: "Lets GravyBlock publish relevant social updates automatically.",
    connect_customer_feed: "Lets GravyBlock send neutral review requests automatically after real completed transactions.",
  };

  const items: NeedsYouItem[] = [];
  for (const [kind, { action, engines }] of byKind) {
    const preset = CONNECT_COPY[kind];
    const why = preset
      ? `${preset} Connect once. GravyBlock takes it from there.`
      : `Unlocks: ${engines.map((e) => ENGINE_NAMES[e]).join(", ")}. Connect once. GravyBlock takes it from there.`;
    items.push({ id: kind, label: action.label, why, href: action.href ?? `/workspace/${r.businessId}`, kind });
  }

  if (pendingDirectories.length > 0) {
    const names = Array.from(new Set(pendingDirectories));
    const shown = names.slice(0, 4).join(", ");
    items.push({
      id: "verify_directory",
      label: `One-time directory verification: ${shown}${names.length > 4 ? ` and ${names.length - 4} more` : ""}`,
      why: "These directories require the business owner to verify once (a code or a phone call). GravyBlock cannot do it for you and keeps the details ready.",
      href: `/workspace/${r.businessId}`,
      kind: "verify_directory",
    });
  }

  items.sort((a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind));
  return items.slice(0, 5);
}

export async function getNeedsYou(businessId: string): Promise<NeedsYouItem[]> {
  try {
    return (await getConnectionReadiness(businessId)).needsYou;
  } catch (err) {
    console.error("[connection-readiness] getNeedsYou failed", err);
    return [];
  }
}

/* ─── Batch ──────────────────────────────────────────────────────────────── */

/** Runs readiness for paid businesses (house accounts included) whose last run is older than 6h. Never throws. */
export async function runConnectionReadinessBatch(limit = 10): Promise<{ processed: number }> {
  try {
    const db = getDb();
    if (!db) return { processed: 0 };
    const paid = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(or(ne(businesses.planTier, "free"), eq(businesses.accountType, "house")))
      .limit(500);
    if (!paid.length) return { processed: 0 };

    const ids = paid.map((b) => b.id);
    const recent = await db
      .select({ businessId: jobs.businessId, createdAt: jobs.createdAt })
      .from(jobs)
      .where(and(inArray(jobs.businessId, ids), eq(jobs.type, "connection_readiness")))
      .orderBy(desc(jobs.createdAt))
      .limit(5000);
    const lastAt = new Map<string, number>();
    for (const r of recent) if (r.businessId && !lastAt.has(r.businessId)) lastAt.set(r.businessId, r.createdAt.getTime());

    const due = ids
      .filter((id) => Date.now() - (lastAt.get(id) ?? 0) > SIX_HOURS)
      .sort((a, b) => (lastAt.get(a) ?? 0) - (lastAt.get(b) ?? 0))
      .slice(0, limit);

    let processed = 0;
    for (const id of due) {
      try {
        await getConnectionReadiness(id, { freshTruth: true });
        processed++;
      } catch (err) {
        console.error("[connection-readiness] batch item failed", id, err);
      }
    }
    return { processed };
  } catch (err) {
    console.error("[connection-readiness] batch failed", err);
    return { processed: 0 };
  }
}
