/**
 * Competitor Gap Engine.
 *
 * Monthly per business: discover up to 5 local competitors (Places API New),
 * read their public sites (sitemap + a few pages, politely bounded) and compute
 * concrete gaps against the customer's VERIFIED Business Truth.
 *
 * Legitimate actions only:
 *  - competitor text is never copied; we only use it to notice a TOPIC gap,
 *  - a page is queued only for a service the customer's own website already
 *    lists (truth.services), titled from the customer's own service text,
 *  - schema / review / cadence gaps are reported, never "fixed" by inventing anything.
 */

import { and, desc, eq, gte, inArray, notInArray } from "drizzle-orm";
import { businessCompetitors, businesses, competitorSnapshots, contentQueue, getDb, jobs } from "@/lib/db";
import { isSafePublicUrl, safeFetchText } from "@/lib/net/safe-fetch";
import { parseSitemap } from "@/lib/truth/extract";
import { ensureFreshTruth, type BusinessTruth } from "@/lib/truth";

const DAY = 86_400_000;
const MAX_COMPETITORS = 5;
const MAX_FETCHES_PER_COMPETITOR = 6;

export type CompetitorProfile = {
  name: string;
  placeId: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  types: string[];
  servicePages: { url: string; title: string }[];
  locationPages: { url: string; title: string }[];
  schemaTypes: string[];
  hasFaqSchema: boolean;
  hasReviewSchema: boolean;
  postsLast90d: number;
  topTitles: string[];
  fetches: number;
};

export type Gap = {
  type: "service_page" | "schema" | "reviews" | "cadence";
  evidence: string;
  actionable: boolean;
  targetService?: string;
};

type Place = {
  id: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  types?: string[];
};

// ── small helpers ───────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function host(u: string | null | undefined): string {
  if (!u) return "";
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

const STOP = new Set(["and", "the", "for", "with", "our", "your", "you", "services", "service", "near", "best", "local", "company", "inc", "llc", "in", "of", "to", "a"]);

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t))
    .map((t) => t.replace(/(ing|es|s)$/, ""))
    .filter((t) => t.length > 2);
}

/** Fraction of `needle` tokens present in `hay` tokens. */
function overlap(needle: string[], hay: string[]): number {
  if (!needle.length) return 0;
  const h = new Set(hay);
  return needle.filter((t) => h.has(t)).length / needle.length;
}

function slugTitle(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim();
  } catch {
    return "";
  }
}

const SERVICE_RE = /\/(services?|what-we-do|solutions?|repair|installation|residential|commercial)(\/|$)/i;
const LOCATION_RE = /\/(locations?|areas?|service-areas?|cities|city)(\/|$)/i;

function collectTypes(node: unknown, out: Set<string>, flags: { review: boolean }, depth = 0): void {
  if (!node || typeof node !== "object" || depth > 6) return;
  if (Array.isArray(node)) {
    for (const n of node.slice(0, 50)) collectTypes(n, out, flags, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x);
  if ("aggregateRating" in obj || "review" in obj) flags.review = true;
  for (const v of Object.values(obj)) if (v && typeof v === "object") collectTypes(v, out, flags, depth + 1);
}

export function parseJsonLd(html: string): { types: string[]; hasReview: boolean } {
  const types = new Set<string>();
  const flags = { review: false };
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(html)) && n++ < 10) {
    try {
      collectTypes(JSON.parse(m[1]!.trim()), types, flags);
    } catch {
      /* invalid JSON-LD block */
    }
  }
  if (types.has("Review") || types.has("AggregateRating")) flags.review = true;
  return { types: [...types], hasReview: flags.review };
}

function pageTitle(html: string): string {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return t.replace(/\s+/g, " ").trim().slice(0, 140);
}

// ── Places discovery ────────────────────────────────────────────────────────

async function searchPlaces(textQuery: string, apiKey: string): Promise<Place[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.types",
    },
    body: JSON.stringify({ textQuery, pageSize: 10 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Places API (New) error: ${res.status}`);
  const data = (await res.json()) as { places?: Place[] };
  return data.places ?? [];
}

// ── competitor site analysis (max 6 fetches) ────────────────────────────────

async function analyzeCompetitorSite(profile: CompetitorProfile): Promise<void> {
  const home = profile.website ? isSafePublicUrl(profile.website) : null;
  if (!home) return;
  const base = home.origin;
  let budget = MAX_FETCHES_PER_COMPETITOR;
  const get = async (url: string, accept?: string) => {
    if (budget <= 0) return null;
    budget--;
    profile.fetches++;
    const r = await safeFetchText(url, { timeoutMs: 7000, ...(accept ? { accept } : {}) });
    return r.ok && r.status < 400 ? r : null;
  };

  const schemaTypes = new Set<string>();
  let review = false;
  const absorb = (html: string) => {
    const ld = parseJsonLd(html);
    ld.types.forEach((t) => schemaTypes.add(t));
    if (ld.hasReview) review = true;
  };

  const homeRes = await get(home.toString());
  const homeLinks: string[] = [];
  if (homeRes) {
    absorb(homeRes.body);
    const t = pageTitle(homeRes.body);
    if (t) profile.topTitles.push(t);
    const linkRe = /<a[^>]+href=["']([^"'#]+)["']/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(homeRes.body)) && homeLinks.length < 80) {
      try {
        const abs = new URL(lm[1]!, homeRes.finalUrl).toString().replace(/[?#].*$/, "");
        if (host(abs) === host(base)) homeLinks.push(abs);
      } catch {
        /* skip */
      }
    }
  }

  // Sitemap (index -> up to 2 children), otherwise fall back to homepage links.
  let entries: { loc: string; lastmod: Date | null }[] = [];
  const sm = await get(`${base}/sitemap.xml`, "application/xml,text/xml,*/*");
  if (sm) {
    let parsed = parseSitemap(sm.body);
    if (parsed.some((e) => e.isIndex)) {
      const kids = parsed.filter((e) => e.isIndex && host(e.loc) === host(base)).slice(0, 2);
      parsed = [];
      for (const k of kids) {
        const r = await get(k.loc, "application/xml,text/xml,*/*");
        if (r) parsed.push(...parseSitemap(r.body));
      }
    }
    entries = parsed.filter((e) => host(e.loc) === host(base));
  }
  if (!entries.length) entries = [...new Set(homeLinks)].map((loc) => ({ loc, lastmod: null }));

  const cutoff = Date.now() - 90 * DAY;
  const blogUrls: string[] = [];
  for (const e of entries) {
    const path = (() => {
      try {
        return new URL(e.loc).pathname;
      } catch {
        return "";
      }
    })();
    if (!path || path === "/") continue;
    if (SERVICE_RE.test(path) && slugTitle(e.loc)) profile.servicePages.push({ url: e.loc, title: slugTitle(e.loc) });
    else if (LOCATION_RE.test(path) && slugTitle(e.loc)) profile.locationPages.push({ url: e.loc, title: slugTitle(e.loc) });
    if (/\/(blog|news|articles?|posts?|resources)\//i.test(path)) {
      blogUrls.push(e.loc);
      if (e.lastmod && e.lastmod.getTime() >= cutoff) profile.postsLast90d++;
    }
  }
  profile.servicePages = profile.servicePages.slice(0, 40);
  profile.locationPages = profile.locationPages.slice(0, 40);

  // Sample up to 2 inner pages (a service page, then a blog post) for schema + titles.
  for (const u of [profile.servicePages[0]?.url, blogUrls[0]]) {
    if (!u) continue;
    const r = await get(u);
    if (!r) continue;
    absorb(r.body);
    const t = pageTitle(r.body);
    if (t) profile.topTitles.push(t);
  }

  profile.schemaTypes = [...schemaTypes].slice(0, 30);
  profile.hasFaqSchema = schemaTypes.has("FAQPage");
  profile.hasReviewSchema = review;
  profile.topTitles = profile.topTitles.slice(0, 5);
}

const LOCAL_BIZ_RE = /(LocalBusiness|Contractor|Plumber|Electrician|Dentist|Attorney|Store|Salon|Restaurant|Clinic|Physician|Roofing|HVACBusiness|Locksmith|AutoRepair|ProfessionalService|HomeAndConstructionBusiness)/;
const WATCHED_SCHEMA = ["LocalBusiness", "FAQPage", "Service", "AggregateRating", "Review", "BreadcrumbList", "Organization"];

function normalizeSchema(types: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of types) {
    if (WATCHED_SCHEMA.includes(t)) out.add(t);
    if (LOCAL_BIZ_RE.test(t)) out.add("LocalBusiness");
  }
  return out;
}

// ── gap computation ─────────────────────────────────────────────────────────

function computeGaps(input: {
  truth: BusinessTruth;
  competitors: CompetitorProfile[];
  ownSchema: Set<string> | null;
  ownUrls: string[];
  ownRating: number | null;
  ownReviews: number | null;
  ownPostsLast90d: number | null;
}): Gap[] {
  const { truth, competitors } = input;
  const gaps: Gap[] = [];

  // (a) service/topic pages competitors have, where the customer ALREADY lists that service but has no page for it.
  const ownHay = [
    ...input.ownUrls.map((u) => tokens(slugTitle(u))),
    ...truth.facts.filter((f) => f.key === "page_topic").map((f) => tokens(f.value)),
  ];
  const seenService = new Set<string>();
  for (const service of truth.services) {
    const st = tokens(service);
    if (!st.length || seenService.has(norm(service))) continue;
    const hasOwnPage = ownHay.some((h) => overlap(st, h) >= 0.75);
    if (hasOwnPage) continue;
    const rivals = competitors.filter((c) => [...c.servicePages, ...c.locationPages].some((p) => overlap(st, tokens(p.title)) >= 0.75));
    if (!rivals.length) continue;
    seenService.add(norm(service));
    gaps.push({
      type: "service_page",
      evidence: `${rivals.length} of ${competitors.length} local competitors have a dedicated page for "${service}"; your website lists this service but has no dedicated page for it.`,
      actionable: true,
      targetService: service,
    });
  }

  // (b) schema types used by >= half of the competitors (min 2) that the homepage lacks.
  if (input.ownSchema) {
    const withSite = competitors.filter((c) => c.fetches > 0);
    const need = Math.max(2, Math.ceil(withSite.length / 2));
    for (const s of WATCHED_SCHEMA) {
      const n = withSite.filter((c) => normalizeSchema(c.schemaTypes).has(s) || (s === "FAQPage" && c.hasFaqSchema) || (s === "Review" && c.hasReviewSchema)).length;
      if (n >= need && !input.ownSchema.has(s)) {
        gaps.push({ type: "schema", evidence: `${n} of ${withSite.length} competitor sites publish ${s} structured data; your homepage does not.`, actionable: false });
      }
    }
  }

  // (c) reviews.
  const rated = competitors.filter((c) => c.reviewCount != null);
  if (rated.length >= 2 && input.ownReviews != null) {
    const sorted = rated.map((c) => c.reviewCount as number).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    if (median > input.ownReviews * 1.25 && median - input.ownReviews >= 10) {
      const ratings = rated.map((c) => c.rating).filter((r): r is number => r != null);
      const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "n/a";
      gaps.push({
        type: "reviews",
        evidence: `Median competitor has ${median} Google reviews (avg rating ${avg}) versus your ${input.ownReviews}${input.ownRating != null ? ` (${input.ownRating})` : ""}.`,
        actionable: false,
      });
    }
  }

  // (d) content cadence.
  const posting = competitors.filter((c) => c.fetches > 0 && c.postsLast90d > 0);
  if (posting.length >= 1) {
    const avg = Math.round(posting.reduce((a, c) => a + c.postsLast90d, 0) / posting.length);
    const own = input.ownPostsLast90d ?? 0;
    if (avg >= 3 && avg > own * 1.5 + 1) {
      gaps.push({
        type: "cadence",
        evidence: `Competitors that publish averaged ${avg} dated posts in the last 90 days versus ${own} on your site.`,
        actionable: false,
      });
    }
  }
  return gaps;
}

// ── own-site read (1-2 fetches on the customer's own domain) ────────────────

async function readOwnSite(website: string | null): Promise<{ schema: Set<string> | null; urls: string[]; postsLast90d: number | null }> {
  const home = website ? isSafePublicUrl(website) : null;
  if (!home) return { schema: null, urls: [], postsLast90d: null };
  const h = await safeFetchText(home.toString(), { timeoutMs: 7000 });
  const schema = h.ok && h.status < 400 ? normalizeSchema(parseJsonLd(h.body).types.concat(parseJsonLd(h.body).hasReview ? ["Review"] : [])) : null;
  const sm = await safeFetchText(`${home.origin}/sitemap.xml`, { timeoutMs: 7000, accept: "application/xml,text/xml,*/*" });
  let urls: string[] = [];
  let posts: number | null = null;
  if (sm.ok && sm.status < 400) {
    const entries = parseSitemap(sm.body).filter((e) => !e.isIndex);
    urls = entries.map((e) => e.loc).slice(0, 500);
    const cutoff = Date.now() - 90 * DAY;
    posts = entries.filter((e) => /\/(blog|news|articles?|posts?|resources)\//i.test(e.loc) && e.lastmod && e.lastmod.getTime() >= cutoff).length;
  }
  return { schema, urls, postsLast90d: posts };
}

// ── run ─────────────────────────────────────────────────────────────────────

type Db = NonNullable<ReturnType<typeof getDb>>;

async function logRun(db: Db, businessId: string, status: string, payload: Record<string, unknown>) {
  await db.insert(jobs).values({ businessId, type: "competitor_gap_run", status, payload }).catch(() => undefined);
}

export async function runCompetitorGapForBusiness(businessId: string): Promise<{ status: string; gaps: number; queued: string | null }> {
  const db = getDb();
  if (!db) return { status: "no_db", gaps: 0, queued: null };
  try {
    const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
    if (!biz) return { status: "business_not_found", gaps: 0, queued: null };
    const truth = await ensureFreshTruth(businessId);
    const city = truth.verifiedCity;
    const category = biz.primaryCategory || (biz.vertical && biz.vertical.toLowerCase() !== "other" ? biz.vertical : null) || truth.services[0] || null;
    if (!city || !category) {
      await logRun(db, businessId, "skipped", { reason: "no_verified_location_or_category" });
      return { status: "skipped", gaps: 0, queued: null };
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      await logRun(db, businessId, "skipped", { reason: "no_places_api_key" });
      return { status: "skipped", gaps: 0, queued: null };
    }

    const query = `${category} in ${city}`;
    const places = await searchPlaces(query, apiKey);
    const ownHost = host(biz.website);
    const picked = places
      .filter((p) => p.id !== biz.placeId && !(ownHost && host(p.websiteUri) === ownHost) && p.displayName?.text)
      .slice(0, MAX_COMPETITORS);

    const profiles: CompetitorProfile[] = picked.map((p) => ({
      name: p.displayName!.text!,
      placeId: p.id,
      website: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      types: (p.types ?? []).slice(0, 6),
      servicePages: [],
      locationPages: [],
      schemaTypes: [],
      hasFaqSchema: false,
      hasReviewSchema: false,
      postsLast90d: 0,
      topTitles: [],
      fetches: 0,
    }));

    // Persist snapshots + competitor rows (deduped).
    const recent = await db
      .select({ placeId: competitorSnapshots.competitorPlaceId })
      .from(competitorSnapshots)
      .where(and(eq(competitorSnapshots.businessId, businessId), eq(competitorSnapshots.source, "competitor_gap"), gte(competitorSnapshots.createdAt, new Date(Date.now() - 25 * DAY))));
    const recentIds = new Set(recent.map((r) => r.placeId));
    const known = await db.select({ placeId: businessCompetitors.placeId, name: businessCompetitors.name }).from(businessCompetitors).where(eq(businessCompetitors.businessId, businessId));
    const knownIds = new Set(known.map((k) => k.placeId).filter(Boolean));
    const knownNames = new Set(known.map((k) => norm(k.name)));
    for (const [i, p] of profiles.entries()) {
      if (!recentIds.has(p.placeId)) {
        await db.insert(competitorSnapshots).values({
          businessId,
          query,
          competitorName: p.name,
          competitorPlaceId: p.placeId,
          rating: p.rating != null ? String(p.rating) : null,
          reviewCount: p.reviewCount,
          estimatedPosition: i + 1,
          source: "competitor_gap",
        });
      }
      if (!knownIds.has(p.placeId) && !knownNames.has(norm(p.name))) {
        await db.insert(businessCompetitors).values({ businessId, name: p.name, website: p.website, placeId: p.placeId, category: p.types[0] ?? category, source: "competitor_gap" });
      }
    }

    for (const p of profiles) {
      try {
        await analyzeCompetitorSite(p);
      } catch (err) {
        console.error("[competitor-gap] site analysis failed", { businessId, competitor: p.name, error: err instanceof Error ? err.message : String(err) });
      }
    }

    const own = await readOwnSite(biz.website);
    const gaps = computeGaps({
      truth,
      competitors: profiles,
      ownSchema: own.schema,
      ownUrls: own.urls,
      ownRating: biz.rating ? Number(biz.rating) : null,
      ownReviews: biz.reviewCount ?? null,
      ownPostsLast90d: own.postsLast90d,
    });

    // Legitimate action: queue ONE page for an actionable service gap.
    let queuedTitle: string | null = null;
    const actionable = gaps.filter((g) => g.actionable && g.targetService && truth.services.includes(g.targetService));
    if (actionable.length) {
      const existing = await db.select({ title: contentQueue.title }).from(contentQueue).where(eq(contentQueue.businessId, businessId)).orderBy(desc(contentQueue.createdAt)).limit(300);
      const used = existing.map((e) => norm(e.title));
      for (const g of actionable) {
        const service = g.targetService!;
        const ns = norm(service);
        if (used.some((u) => u.includes(ns))) continue;
        const name = truth.businessName;
        const title = `${service} in ${city} — ${name}`;
        await db.insert(contentQueue).values({
          businessId,
          kind: "location_page",
          title,
          outline: `A dedicated page for ${name}'s "${service}" in ${city}. Use ONLY verified facts about ${name} from its own website, Google profile or owner. Do not copy or paraphrase any competitor, and do not add services, prices, hours, awards or claims that are not in the verified facts.`,
          targetKeyword: `${service} in ${city}`,
          status: "queued",
          variant: "gap_action",
        });
        await db.insert(jobs).values({ businessId, type: "competitor_gap_action", status: "queued", payload: { queuedTitle: title, service, reason: g.evidence } });
        queuedTitle = title;
        break;
      }
    }

    await db.insert(jobs).values({
      businessId,
      type: "competitor_gap",
      status: "completed",
      payload: {
        query,
        competitors: profiles.map((p) => ({
          name: p.name,
          website: p.website,
          rating: p.rating,
          reviewCount: p.reviewCount,
          types: p.types,
          servicePages: p.servicePages.slice(0, 12).map((s) => s.title),
          locationPages: p.locationPages.slice(0, 8).map((s) => s.title),
          schemaTypes: p.schemaTypes,
          hasFaqSchema: p.hasFaqSchema,
          hasReviewSchema: p.hasReviewSchema,
          postsLast90d: p.postsLast90d,
          topTitles: p.topTitles,
        })),
        gaps,
      },
    });
    await logRun(db, businessId, "completed", { competitors: profiles.length, gaps: gaps.length, queuedTitle });
    return { status: "completed", gaps: gaps.length, queued: queuedTitle };
  } catch (err) {
    console.error("[competitor-gap] failed", { businessId, error: err instanceof Error ? err.message : String(err) });
    try {
      await logRun(db, businessId, "failed", { error: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
    } catch {
      /* never throw */
    }
    return { status: "failed", gaps: 0, queued: null };
  }
}

/** Monthly batch: paid businesses without a recent run (skipped/failed runs retry after 7 days). */
export async function runCompetitorGapBatch(limit = 4): Promise<{ ran: number; queued: number }> {
  const db = getDb();
  if (!db) return { ran: 0, queued: 0 };
  let ran = 0;
  let queued = 0;
  try {
    const paid = await db.select({ id: businesses.id }).from(businesses).where(notInArray(businesses.planTier, ["free"])).limit(500);
    for (const b of paid) {
      if (ran >= limit) break;
      const [last] = await db
        .select({ createdAt: jobs.createdAt, status: jobs.status })
        .from(jobs)
        .where(and(eq(jobs.businessId, b.id), eq(jobs.type, "competitor_gap_run")))
        .orderBy(desc(jobs.createdAt))
        .limit(1);
      const age = last ? Date.now() - last.createdAt.getTime() : Infinity;
      const window = last && last.status === "completed" ? 30 * DAY : 7 * DAY;
      if (age < window) continue;
      const r = await runCompetitorGapForBusiness(b.id);
      ran++;
      if (r.queued) queued++;
    }
  } catch (err) {
    console.error("[competitor-gap] batch failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return { ran, queued };
}

/** Latest computed gaps for UI / reporting. */
export async function getCompetitorSummary(businessId: string): Promise<{ createdAt: Date; competitors: unknown[]; gaps: Gap[] } | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const [row] = await db
      .select({ createdAt: jobs.createdAt, payload: jobs.payload })
      .from(jobs)
      .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "competitor_gap"), inArray(jobs.status, ["completed"])))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (!row) return null;
    const p = (row.payload ?? {}) as { competitors?: unknown[]; gaps?: Gap[] };
    return { createdAt: row.createdAt, competitors: p.competitors ?? [], gaps: p.gaps ?? [] };
  } catch {
    return null;
  }
}
