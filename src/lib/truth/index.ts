/**
 * Business Truth layer — public API.
 *
 *  refreshBusinessTruth(id)  crawl the company's own site/sitemap + read GBP,
 *                            Search Console and owner-supplied data; persist
 *                            every fact with provenance and supersede stale ones.
 *  getBusinessTruth(id)      read current facts, applying freshness rules.
 *  ensureFreshTruth(id)      refresh first when the last successful website
 *                            crawl is older than maxAgeDays.
 *
 * Generators must take facts from here and refuse to state anything about the
 * business that is not present (see renderTruthPromptBlock).
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { businessConfigs, businessFacts, businesses, getDb, jobs, keywordRankings } from "@/lib/db";
import { isSafePublicUrl, safeFetchText } from "@/lib/net/safe-fetch";
import {
  SINGLE_VALUED_KEYS,
  factsFromHtml,
  isContentPath,
  isServicePath,
  parseSitemap,
  type ExtractedFact,
  type FactKey,
} from "./extract";

export type { FactKey, ExtractedFact } from "./extract";

const MAX_PAGES = 10;
const TIME_SENSITIVE_MAX_AGE_DAYS = 90;
const STABLE_STALE_AFTER_DAYS = 120;

type Db = NonNullable<ReturnType<typeof getDb>>;

function hashFact(key: string, value: string): string {
  return createHash("sha256").update(`${key}|${value.trim().toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 32);
}

function sameSite(a: string, b: string): boolean {
  try {
    const norm = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    return norm(new URL(a).hostname) === norm(new URL(b).hostname);
  } catch {
    return false;
  }
}

async function persistFacts(
  db: Db,
  businessId: string,
  incoming: ExtractedFact[],
  opts: { complete: boolean },
): Promise<{ added: number; unchanged: number; superseded: number }> {
  const now = new Date();
  let added = 0;
  let unchanged = 0;
  let superseded = 0;
  const touched: string[] = [];

  const current = await db
    .select()
    .from(businessFacts)
    .where(and(eq(businessFacts.businessId, businessId), eq(businessFacts.status, "current")));

  // De-dupe within this run (same hash from the same source URL only once).
  const seen = new Set<string>();
  for (const f of incoming) {
    const value = f.value.trim();
    if (!value) continue;
    const contentHash = hashFact(f.key, value);
    const dedupeKey = `${f.sourceSystem}|${contentHash}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sameHash = current.find((c) => c.contentHash === contentHash && c.sourceSystem === f.sourceSystem);
    if (sameHash) {
      await db
        .update(businessFacts)
        .set({ fetchedAt: now, confidence: Math.max(sameHash.confidence, f.confidence), sourceUrl: f.sourceUrl ?? sameHash.sourceUrl })
        .where(eq(businessFacts.id, sameHash.id));
      touched.push(sameHash.id);
      unchanged++;
      continue;
    }

    if (SINGLE_VALUED_KEYS.has(f.key)) {
      // One current value per source system per key. Values from DIFFERENT
      // sources are kept side by side on purpose — a disagreement between the
      // company's website and its Google profile is real information the
      // citation engine reports as drift (readers pick the highest-confidence value).
      const older = current.filter((c) => c.factKey === f.key && c.sourceSystem === f.sourceSystem);
      for (const o of older) {
        await db.update(businessFacts).set({ status: "superseded", supersededAt: now }).where(eq(businessFacts.id, o.id));
        superseded++;
      }
    }

    const [row] = await db
      .insert(businessFacts)
      .values({
        businessId,
        factKey: f.key,
        factValue: value,
        sourceSystem: f.sourceSystem,
        sourceUrl: f.sourceUrl,
        fetchedAt: now,
        sourceUpdatedAt: f.sourceUpdatedAt ?? null,
        confidence: f.confidence,
        contentHash,
        stability: f.stability,
        status: "current",
      })
      .returning({ id: businessFacts.id });
    if (row) touched.push(row.id);
    added++;
  }

  // Facts a source used to state but no longer does (only trusted after a
  // complete crawl, so a transient fetch failure can't wipe the record).
  if (opts.complete) {
    const stale = current.filter(
      (c) => (c.sourceSystem === "website" || c.sourceSystem === "sitemap") && !touched.includes(c.id),
    );
    if (stale.length) {
      await db
        .update(businessFacts)
        .set({ status: "superseded", supersededAt: now })
        .where(inArray(businessFacts.id, stale.map((s) => s.id)));
      superseded += stale.length;
    }
  }
  return { added, unchanged, superseded };
}

async function crawlWebsite(website: string): Promise<{ facts: ExtractedFact[]; homepageOk: boolean; pagesFetched: number; note: string }> {
  const home = isSafePublicUrl(website);
  if (!home) return { facts: [], homepageOk: false, pagesFetched: 0, note: "invalid_website_url" };
  const facts: ExtractedFact[] = [];

  const homeRes = await safeFetchText(home.toString());
  if (!homeRes.ok || homeRes.status >= 400) {
    return { facts, homepageOk: false, pagesFetched: 0, note: homeRes.ok ? `homepage_http_${homeRes.status}` : homeRes.error };
  }
  facts.push(...factsFromHtml(homeRes.body, homeRes.finalUrl, { isHomepage: true }));
  let pagesFetched = 1;
  const base = homeRes.finalUrl;

  // Pages to visit: internal links from the homepage that look like service
  // or content pages + sitemap entries (newest lastmod first for content).
  const candidates = new Map<string, Date | null>();
  const linkRe = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(homeRes.body)) && candidates.size < 60) {
    try {
      const abs = new URL(lm[1]!, base).toString().replace(/[?#].*$/, "");
      if (sameSite(abs, base) && (isServicePath(abs) || isContentPath(abs) || /\/(about|contact|areas?|locations?)(\/|$)/i.test(abs))) candidates.set(abs, null);
    } catch {
      /* skip bad hrefs */
    }
  }

  const sitemapUrl = new URL("/sitemap.xml", base).toString();
  const sm = await safeFetchText(sitemapUrl, { accept: "application/xml,text/xml,*/*", timeoutMs: 7000 });
  if (sm.ok && sm.status < 400) {
    let entries = parseSitemap(sm.body);
    if (entries.some((e) => e.isIndex)) {
      const child = entries.filter((e) => e.isIndex).slice(0, 3);
      entries = [];
      for (const c of child) {
        if (!sameSite(c.loc, base)) continue;
        const r = await safeFetchText(c.loc, { accept: "application/xml,text/xml,*/*", timeoutMs: 7000 });
        if (r.ok && r.status < 400) entries.push(...parseSitemap(r.body));
      }
    }
    const ranked = entries
      .filter((e) => sameSite(e.loc, base) && (isServicePath(e.loc) || isContentPath(e.loc)))
      .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));
    for (const e of ranked.slice(0, 24)) if (!candidates.has(e.loc)) candidates.set(e.loc, e.lastmod);
  }

  const targets = [...candidates.entries()]
    .sort((a, b) => Number(isServicePath(b[0])) - Number(isServicePath(a[0])))
    .slice(0, MAX_PAGES - 1);
  for (const [url, lastmod] of targets) {
    const r = await safeFetchText(url, { timeoutMs: 7000 });
    if (!r.ok || r.status >= 400) continue;
    pagesFetched++;
    const lastModHeader = r.headers.get("last-modified");
    facts.push(
      ...factsFromHtml(r.body, r.finalUrl, {
        isHomepage: false,
        lastModified: lastmod ?? (lastModHeader ? new Date(lastModHeader) : null),
      }),
    );
  }
  return { facts, homepageOk: true, pagesFetched, note: "ok" };
}

function firstToken(s: string | null | undefined): string {
  return (s ?? "").split(",")[0]?.trim() ?? "";
}

export async function refreshBusinessTruth(businessId: string): Promise<{ ok: boolean; homepageOk: boolean; pagesFetched: number; added: number; unchanged: number; superseded: number; note: string }> {
  const db = getDb();
  if (!db) return { ok: false, homepageOk: false, pagesFetched: 0, added: 0, unchanged: 0, superseded: 0, note: "no_db" };

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return { ok: false, homepageOk: false, pagesFetched: 0, added: 0, unchanged: 0, superseded: 0, note: "business_not_found" };
  const [cfg] = await db.select().from(businessConfigs).where(eq(businessConfigs.businessId, businessId)).limit(1);

  const facts: ExtractedFact[] = [];
  const gbpUrl = biz.googleMapsUri ?? null;

  // GBP / Google Places record (identity fields only — no inference).
  if (biz.placeId) {
    if (biz.name) facts.push({ key: "name", value: biz.name, confidence: 80, stability: "stable", sourceSystem: "gbp", sourceUrl: gbpUrl });
    if (biz.phone) facts.push({ key: "phone", value: biz.phone, confidence: 80, stability: "stable", sourceSystem: "gbp", sourceUrl: gbpUrl });
    if (biz.address) {
      facts.push({ key: "address", value: biz.address, confidence: 80, stability: "stable", sourceSystem: "gbp", sourceUrl: gbpUrl });
      const parts = biz.address.split(",").map((p) => p.trim());
      if (parts.length >= 3 && parts[1]) facts.push({ key: "city", value: parts[1], confidence: 78, stability: "stable", sourceSystem: "gbp", sourceUrl: gbpUrl });
    }
  }

  // Owner-supplied (explicit, highest trust).
  if (cfg?.serviceDescription) facts.push({ key: "description", value: cfg.serviceDescription.slice(0, 500), confidence: 95, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  if (cfg?.uniqueSellingPoints) facts.push({ key: "owner_note", value: cfg.uniqueSellingPoints.slice(0, 500), confidence: 95, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  if (cfg?.source === "owner_form") {
    const city = firstToken(cfg.targetScope);
    if (city && !/^(united states|global|worldwide)$/i.test(city)) facts.push({ key: "city", value: city, confidence: 92, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  }

  // Connected Search Console demand (real queries, last 30 days).
  const gsc = await db
    .select({ keyword: keywordRankings.keyword, impressions: sql<number>`sum(${keywordRankings.impressions})::int` })
    .from(keywordRankings)
    .where(and(eq(keywordRankings.businessId, businessId), eq(keywordRankings.source, "gsc"), sql`${keywordRankings.date} >= to_char(now() - interval '30 days','YYYY-MM-DD')`))
    .groupBy(keywordRankings.keyword)
    .orderBy(desc(sql`sum(${keywordRankings.impressions})`))
    .limit(10)
    .catch(() => [] as { keyword: string; impressions: number }[]);
  for (const g of gsc) facts.push({ key: "search_demand", value: `${g.keyword} (${g.impressions} impressions/30d)`, confidence: 90, stability: "time_sensitive", sourceSystem: "gsc", sourceUrl: null });

  // Company's own website + sitemap.
  let crawl = { facts: [] as ExtractedFact[], homepageOk: false, pagesFetched: 0, note: "no_website" };
  if (biz.website) crawl = await crawlWebsite(biz.website);
  facts.push(...crawl.facts);

  const stats = await persistFacts(db, businessId, facts, { complete: crawl.homepageOk });

  await db.insert(jobs).values({
    businessId,
    type: "truth_refresh",
    status: crawl.homepageOk ? "completed" : "partial",
    payload: { ...stats, homepageOk: crawl.homepageOk, pagesFetched: crawl.pagesFetched, note: crawl.note, factsSeen: facts.length },
  });

  return { ok: true, homepageOk: crawl.homepageOk, pagesFetched: crawl.pagesFetched, ...stats, note: crawl.note };
}

export type TruthFact = {
  key: FactKey;
  value: string;
  sourceSystem: string;
  sourceUrl: string | null;
  fetchedAt: Date;
  sourceUpdatedAt: Date | null;
  confidence: number;
  stability: string;
};

export type BusinessTruth = {
  businessId: string;
  businessName: string;
  facts: TruthFact[];
  verifiedCity: string | null;
  services: string[];
  description: string | null;
  lastWebsiteCrawlAt: Date | null;
  /** True when there is enough first-party information to write about this business without inventing anything. */
  sufficient: boolean;
  insufficientReason: string | null;
  promptBlock: string;
};

function best(facts: TruthFact[], key: FactKey): TruthFact | undefined {
  return facts.filter((f) => f.key === key).sort((a, b) => b.confidence - a.confidence)[0];
}

export async function getBusinessTruth(businessId: string): Promise<BusinessTruth> {
  const db = getDb();
  const empty: BusinessTruth = {
    businessId,
    businessName: "",
    facts: [],
    verifiedCity: null,
    services: [],
    description: null,
    lastWebsiteCrawlAt: null,
    sufficient: false,
    insufficientReason: "no_database",
    promptBlock: "",
  };
  if (!db) return empty;

  const [biz] = await db.select({ name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const rows = await db
    .select()
    .from(businessFacts)
    .where(and(eq(businessFacts.businessId, businessId), eq(businessFacts.status, "current")))
    .orderBy(desc(businessFacts.confidence));

  const now = Date.now();
  const day = 86_400_000;
  const usable: TruthFact[] = rows
    .filter((r) => {
      const ref = (r.sourceUpdatedAt ?? r.fetchedAt).getTime();
      if (r.stability === "time_sensitive" && now - ref > TIME_SENSITIVE_MAX_AGE_DAYS * day) return false;
      return true;
    })
    .map((r) => ({
      key: r.factKey as FactKey,
      value: r.factValue,
      sourceSystem: r.sourceSystem,
      sourceUrl: r.sourceUrl,
      fetchedAt: r.fetchedAt,
      sourceUpdatedAt: r.sourceUpdatedAt,
      confidence: r.confidence,
      stability: r.stability,
    }));

  const websiteFacts = rows.filter((r) => r.sourceSystem === "website" || r.sourceSystem === "sitemap");
  const lastWebsiteCrawlAt = websiteFacts.length ? new Date(Math.max(...websiteFacts.map((r) => r.fetchedAt.getTime()))) : null;
  const staleWebsite = lastWebsiteCrawlAt ? now - lastWebsiteCrawlAt.getTime() > STABLE_STALE_AFTER_DAYS * day : true;

  const cityFact = best(usable, "city");
  const services = [...new Set(usable.filter((f) => f.key === "service").map((f) => f.value))].slice(0, 12);
  const descFact = best(usable, "description");
  const topics = usable.filter((f) => f.key === "page_topic");
  const ownerProvided = usable.some((f) => f.sourceSystem === "owner" && f.key === "description");

  let sufficient = false;
  let insufficientReason: string | null = null;
  if (!best(usable, "name") && !biz?.name) insufficientReason = "no_business_name";
  else if (!ownerProvided && (staleWebsite || !lastWebsiteCrawlAt)) insufficientReason = "no_recent_first_party_website_data";
  else if (!ownerProvided && services.length === 0 && !descFact && topics.length < 3) insufficientReason = "website_states_too_little_to_write_from";
  else sufficient = true;

  const t = (f?: TruthFact) => (f ? f.value : null);
  const lines: string[] = [];
  const src = (f: TruthFact) => `${f.sourceSystem}${f.sourceUrl ? ` ${f.sourceUrl}` : ""}, checked ${f.fetchedAt.toISOString().slice(0, 10)}`;
  const nameFact = best(usable, "name");
  lines.push(`Business name: ${t(nameFact) ?? biz?.name ?? ""}`);
  if (cityFact) lines.push(`City: ${cityFact.value} (${src(cityFact)})`);
  const addr = best(usable, "address");
  if (addr) lines.push(`Address: ${addr.value} (${src(addr)})`);
  const phone = best(usable, "phone");
  if (phone) lines.push(`Phone: ${phone.value}`);
  const hours = best(usable, "hours");
  if (hours) lines.push(`Hours: ${hours.value} (${src(hours)})`);
  if (descFact) lines.push(`How the company describes itself: ${descFact.value} (${src(descFact)})`);
  if (services.length) lines.push(`Services/offerings listed on their website: ${services.join("; ")}`);
  const areas = [...new Set(usable.filter((f) => f.key === "service_area").map((f) => f.value))];
  if (areas.length) lines.push(`Service area stated by the company: ${areas.join("; ")}`);
  const owner = usable.filter((f) => f.key === "owner_note").map((f) => f.value);
  if (owner.length) lines.push(`Differentiators supplied by the owner: ${owner.join(" | ")}`);
  const recent = usable
    .filter((f) => f.key === "recent_content")
    .sort((a, b) => (b.sourceUpdatedAt ?? b.fetchedAt).getTime() - (a.sourceUpdatedAt ?? a.fetchedAt).getTime())
    .slice(0, 5);
  if (recent.length) {
    lines.push(
      `Recent things the company published (current information): ${recent
        .map((f) => `"${f.value}"${f.sourceUpdatedAt ? ` (${f.sourceUpdatedAt.toISOString().slice(0, 10)})` : ""}`)
        .join("; ")}`,
    );
  }
  if (topics.length) lines.push(`Topics their website covers: ${[...new Set(topics.map((f) => f.value))].slice(0, 8).join("; ")}`);
  const demand = usable.filter((f) => f.key === "search_demand").slice(0, 5).map((f) => f.value);
  if (demand.length) lines.push(`Real search queries people used to find them (Search Console): ${demand.join("; ")}`);

  const promptBlock = [
    "VERIFIED BUSINESS FACTS (first-party sources only — the company's own website, its Google Business Profile, connected Search Console, or the owner):",
    ...lines.map((l) => `- ${l}`),
    "",
    "RULES: State facts about this business ONLY if they appear above. If something is not listed (services, locations, hours, prices, promotions, staff, years in business, awards, projects, statistics, customer stories), do not mention it and do not imply it. Prefer the most recent items. Never present general web knowledge as a fact about this company.",
  ].join("\n");

  return {
    businessId,
    businessName: t(nameFact) ?? biz?.name ?? "",
    facts: usable,
    verifiedCity: cityFact?.value ?? null,
    services,
    description: descFact?.value ?? null,
    lastWebsiteCrawlAt,
    sufficient,
    insufficientReason,
    promptBlock,
  };
}

/** Refresh first when the last successful website crawl is older than maxAgeDays (default 7), then read. */
export async function ensureFreshTruth(businessId: string, maxAgeDays = 7): Promise<BusinessTruth> {
  const db = getDb();
  if (db) {
    const [last] = await db
      .select({ createdAt: jobs.createdAt })
      .from(jobs)
      .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "truth_refresh")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    if (!last || Date.now() - last.createdAt.getTime() > maxAgeDays * 86_400_000) {
      try {
        await refreshBusinessTruth(businessId);
      } catch (err) {
        console.error("[truth] refresh failed", { businessId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return getBusinessTruth(businessId);
}

/** Weekly batch — every paid/house business, oldest refresh first. */
export async function runTruthRefreshBatch(batchSize = 6): Promise<{ refreshed: number }> {
  const db = getDb();
  if (!db) return { refreshed: 0 };
  const paid = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(notInArray(businesses.planTier, ["free"]))
    .limit(500);
  const due: { id: string; last: number }[] = [];
  for (const b of paid) {
    const [last] = await db
      .select({ createdAt: jobs.createdAt })
      .from(jobs)
      .where(and(eq(jobs.businessId, b.id), eq(jobs.type, "truth_refresh")))
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    const age = last ? Date.now() - last.createdAt.getTime() : Infinity;
    if (age > 6 * 86_400_000) due.push({ id: b.id, last: last?.createdAt.getTime() ?? 0 });
  }
  due.sort((a, b) => a.last - b.last);
  let refreshed = 0;
  for (const d of due.slice(0, batchSize)) {
    try {
      await refreshBusinessTruth(d.id);
      refreshed++;
    } catch (err) {
      console.error("[truth] batch refresh failed", { businessId: d.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { refreshed };
}
