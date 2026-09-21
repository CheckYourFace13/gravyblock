/**
 * Business Truth layer — public API.
 *
 *  refreshBusinessTruth(id, mode)  mode "light" (daily): homepage + sitemap + the few
 *                                  newest/changed pages, using conditional requests
 *                                  (ETag / Last-Modified), sitemap lastmod and content
 *                                  hashes — unchanged pages cost one 304 and no parsing.
 *                                  mode "deep" (weekly): the broader inventory, and it
 *                                  is the only mode allowed to retire facts a site
 *                                  stopped stating.
 *  getBusinessTruth(id)            current, non-expired facts + prompt block.
 *  ensureFreshTruth(id)            light-refresh when the last refresh is over a day old.
 *
 * No model call is made anywhere in this module. Generators must take facts
 * from here and refuse to state anything about the business that is not present.
 */

import { createHash } from "node:crypto";
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { businessConfigs, businessFacts, businesses, getDb, jobs, keywordRankings, scans, truthPages } from "@/lib/db";
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

export type RefreshMode = "light" | "deep";

const DEEP_MAX_PAGES = 10;
const LIGHT_MAX_PAGES = 6;
const TIME_SENSITIVE_MAX_AGE_DAYS = 90;
const STABLE_STALE_AFTER_DAYS = 120;
const DAY = 86_400_000;

type Db = NonNullable<ReturnType<typeof getDb>>;

function hashFact(key: string, value: string): string {
  return createHash("sha256").update(`${key}|${value.trim().toLowerCase().replace(/\s+/g, " ")}`).digest("hex").slice(0, 32);
}
const hashBody = (body: string) => createHash("sha256").update(body).digest("hex").slice(0, 32);

function sameSite(a: string, b: string): boolean {
  try {
    const norm = (h: string) => h.replace(/^www\./i, "").toLowerCase();
    return norm(new URL(a).hostname) === norm(new URL(b).hostname);
  } catch {
    return false;
  }
}

type PersistOpts = { complete: boolean; changedUrls: string[]; unchangedUrls: string[] };

async function persistFacts(
  db: Db,
  businessId: string,
  incoming: ExtractedFact[],
  opts: PersistOpts,
): Promise<{ added: number; unchanged: number; superseded: number; expired: number }> {
  const now = new Date();
  let added = 0;
  let unchanged = 0;
  let superseded = 0;
  const touched = new Set<string>();

  const current = await db
    .select()
    .from(businessFacts)
    .where(and(eq(businessFacts.businessId, businessId), eq(businessFacts.status, "current")));

  // Pages the server told us have not changed: their facts are still true as of now.
  const untouchedFactIds = current.filter((c) => c.sourceUrl && opts.unchangedUrls.includes(c.sourceUrl)).map((c) => c.id);
  if (untouchedFactIds.length) {
    await db.update(businessFacts).set({ fetchedAt: now }).where(inArray(businessFacts.id, untouchedFactIds));
    untouchedFactIds.forEach((id) => touched.add(id));
  }

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
        .set({
          fetchedAt: now,
          confidence: Math.max(sameHash.confidence, f.confidence),
          sourceUrl: f.sourceUrl ?? sameHash.sourceUrl,
          expiresAt: f.expiresAt ?? sameHash.expiresAt,
        })
        .where(eq(businessFacts.id, sameHash.id));
      touched.add(sameHash.id);
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
        expiresAt: f.expiresAt ?? null,
      })
      .returning({ id: businessFacts.id });
    if (row) touched.add(row.id);
    added++;
  }

  // Facts a page used to state but no longer does. A deep, complete crawl may
  // retire anything not re-observed; a light run only retires facts from pages
  // it actually re-read and found changed (never from a page it did not read).
  const stale = current.filter(
    (c) =>
      (c.sourceSystem === "website" || c.sourceSystem === "sitemap") &&
      !touched.has(c.id) &&
      (opts.complete || (c.sourceUrl != null && opts.changedUrls.includes(c.sourceUrl))),
  );
  if (stale.length) {
    await db
      .update(businessFacts)
      .set({ status: "superseded", supersededAt: now })
      .where(inArray(businessFacts.id, stale.map((s) => s.id)));
    superseded += stale.length;
  }

  // Time-sensitive facts past their expiry are retired outright (events, offers, news).
  const expiredRows = await db
    .update(businessFacts)
    .set({ status: "superseded", supersededAt: now })
    .where(and(eq(businessFacts.businessId, businessId), eq(businessFacts.status, "current"), sql`${businessFacts.expiresAt} is not null and ${businessFacts.expiresAt} < now()`))
    .returning({ id: businessFacts.id });

  return { added, unchanged, superseded, expired: expiredRows.length };
}

type CrawlResult = {
  facts: ExtractedFact[];
  homepageOk: boolean;
  pagesRequested: number;
  pagesChanged: number;
  pagesNotModified: number;
  changedUrls: string[];
  unchangedUrls: string[];
  note: string;
};

/** One conditional fetch through the per-URL cache. Returns null when the page could not be read. */
async function fetchCached(
  db: Db,
  businessId: string,
  url: string,
  sitemapLastmod: Date | null,
  cache: Map<string, typeof truthPages.$inferSelect>,
): Promise<{ changed: boolean; body: string | null; finalUrl: string; lastModified: Date | null } | null> {
  const known = cache.get(url);
  const headers: Record<string, string> = {};
  if (known?.etag) headers["if-none-match"] = known.etag;
  if (known?.lastModified) headers["if-modified-since"] = known.lastModified;
  const r = await safeFetchText(url, { timeoutMs: 8000, headers });
  if (!r.ok) return null;
  const now = new Date();
  if (r.status === 304) {
    await db.update(truthPages).set({ lastFetchedAt: now }).where(and(eq(truthPages.businessId, businessId), eq(truthPages.url, url)));
    return { changed: false, body: null, finalUrl: url, lastModified: null };
  }
  if (r.status >= 400) return null;
  const hash = hashBody(r.body);
  const etag = r.headers.get("etag");
  const lastModifiedHeader = r.headers.get("last-modified");
  const lastModified = lastModifiedHeader ? new Date(lastModifiedHeader) : null;
  if (known && known.contentHash === hash) {
    await db
      .update(truthPages)
      .set({ lastFetchedAt: now, etag: etag ?? known.etag, lastModified: lastModifiedHeader ?? known.lastModified, sitemapLastmod })
      .where(and(eq(truthPages.businessId, businessId), eq(truthPages.url, url)));
    return { changed: false, body: null, finalUrl: r.finalUrl, lastModified };
  }
  if (known) {
    await db
      .update(truthPages)
      .set({ etag, lastModified: lastModifiedHeader, contentHash: hash, sitemapLastmod, lastFetchedAt: now, lastChangedAt: now })
      .where(and(eq(truthPages.businessId, businessId), eq(truthPages.url, url)));
  } else {
    await db.insert(truthPages).values({ businessId, url, etag, lastModified: lastModifiedHeader, contentHash: hash, sitemapLastmod, lastFetchedAt: now, lastChangedAt: now });
  }
  return { changed: true, body: r.body, finalUrl: r.finalUrl, lastModified };
}

async function crawlWebsite(db: Db, businessId: string, website: string, mode: RefreshMode): Promise<CrawlResult> {
  const empty: CrawlResult = { facts: [], homepageOk: false, pagesRequested: 0, pagesChanged: 0, pagesNotModified: 0, changedUrls: [], unchangedUrls: [], note: "" };
  const home = isSafePublicUrl(website);
  if (!home) return { ...empty, note: "invalid_website_url" };

  const cacheRows = await db.select().from(truthPages).where(eq(truthPages.businessId, businessId));
  const cache = new Map(cacheRows.map((r) => [r.url, r]));
  const out: CrawlResult = { ...empty };

  const homeUrl = home.toString();
  const homeRes = await fetchCached(db, businessId, homeUrl, null, cache);
  if (!homeRes) return { ...empty, note: "homepage_unreachable" };
  out.homepageOk = true;
  out.pagesRequested++;
  const homeBase = homeRes.finalUrl;
  let homeBody = homeRes.body;
  if (homeRes.changed && homeBody) {
    out.pagesChanged++;
    out.changedUrls.push(homeBase, homeUrl);
    out.facts.push(...factsFromHtml(homeBody, homeBase, { isHomepage: true }));
  } else {
    out.pagesNotModified++;
    out.unchangedUrls.push(homeBase, homeUrl);
    // Unchanged homepage: re-read once only to discover links (not parsed for facts).
    if (mode === "deep" || cache.size < 3) {
      const again = await safeFetchText(homeUrl, { timeoutMs: 8000 });
      homeBody = again.ok && again.status < 400 ? again.body : null;
    }
  }

  // Candidate pages: internal links from the homepage + sitemap (newest lastmod first).
  const candidates = new Map<string, Date | null>();
  if (homeBody) {
    const linkRe = /<a[^>]+href=["']([^"'#]+)["']/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(homeBody)) && candidates.size < 60) {
      try {
        const abs = new URL(lm[1]!, homeBase).toString().replace(/[?#].*$/, "");
        if (sameSite(abs, homeBase) && (isServicePath(abs) || isContentPath(abs) || /\/(about|contact|areas?|locations?)(\/|$)/i.test(abs))) candidates.set(abs, null);
      } catch {
        /* skip bad hrefs */
      }
    }
  }

  const sitemapUrl = new URL("/sitemap.xml", homeBase).toString();
  const sm = await safeFetchText(sitemapUrl, { accept: "application/xml,text/xml,*/*", timeoutMs: 7000 });
  if (sm.ok && sm.status < 400) {
    let entries = parseSitemap(sm.body);
    if (entries.some((e) => e.isIndex)) {
      const child = entries.filter((e) => e.isIndex).slice(0, 3);
      entries = [];
      for (const c of child) {
        if (!sameSite(c.loc, homeBase)) continue;
        const r = await safeFetchText(c.loc, { accept: "application/xml,text/xml,*/*", timeoutMs: 7000 });
        if (r.ok && r.status < 400) entries.push(...parseSitemap(r.body));
      }
    }
    const ranked = entries
      .filter((e) => sameSite(e.loc, homeBase) && (isServicePath(e.loc) || isContentPath(e.loc)))
      .sort((a, b) => (b.lastmod?.getTime() ?? 0) - (a.lastmod?.getTime() ?? 0));
    for (const e of ranked.slice(0, 24)) {
      if (!candidates.has(e.loc) || e.lastmod) candidates.set(e.loc, e.lastmod);
    }
  }

  let targets = [...candidates.entries()];
  if (mode === "light") {
    // Only pages that are new to us, or whose sitemap lastmod is newer than what we last saw.
    targets = targets.filter(([url, lastmod]) => {
      const known = cache.get(url);
      if (!known) return true;
      return lastmod != null && (known.sitemapLastmod == null || lastmod.getTime() > known.sitemapLastmod.getTime());
    });
  }
  targets.sort((a, b) => (b[1]?.getTime() ?? 0) - (a[1]?.getTime() ?? 0) || Number(isServicePath(b[0])) - Number(isServicePath(a[0])));
  targets = targets.slice(0, mode === "light" ? LIGHT_MAX_PAGES : DEEP_MAX_PAGES - 1);

  // In a deep crawl also re-validate already-known pages cheaply (304) so their facts stay current.
  if (mode === "deep") {
    for (const known of cacheRows) {
      if (known.url !== homeUrl && known.url !== homeBase && !targets.some(([u]) => u === known.url) && targets.length < DEEP_MAX_PAGES - 1) {
        targets.push([known.url, null]);
      }
    }
  }

  for (const [url, lastmod] of targets) {
    const r = await fetchCached(db, businessId, url, lastmod, cache);
    if (!r) continue;
    out.pagesRequested++;
    if (!r.changed || !r.body) {
      out.pagesNotModified++;
      out.unchangedUrls.push(url, r.finalUrl);
      continue;
    }
    out.pagesChanged++;
    out.changedUrls.push(url, r.finalUrl);
    out.facts.push(...factsFromHtml(r.body, r.finalUrl, { isHomepage: false, lastModified: lastmod ?? r.lastModified }));
  }
  out.note = "ok";
  return out;
}

function firstToken(s: string | null | undefined): string {
  return (s ?? "").split(",")[0]?.trim() ?? "";
}

export type RefreshResult = {
  ok: boolean;
  mode: RefreshMode;
  homepageOk: boolean;
  pagesRequested: number;
  pagesChanged: number;
  pagesNotModified: number;
  added: number;
  unchanged: number;
  superseded: number;
  expired: number;
  modelCalls: 0;
  note: string;
};

export async function refreshBusinessTruth(businessId: string, mode: RefreshMode = "deep"): Promise<RefreshResult> {
  const fail = (note: string): RefreshResult => ({ ok: false, mode, homepageOk: false, pagesRequested: 0, pagesChanged: 0, pagesNotModified: 0, added: 0, unchanged: 0, superseded: 0, expired: 0, modelCalls: 0, note });
  const db = getDb();
  if (!db) return fail("no_db");

  const [biz] = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (!biz) return fail("business_not_found");
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

  // Owner-supplied (explicit, highest trust) — only when the owner actually filled the form.
  const ownerSupplied = cfg?.source === "owner_form";
  if (ownerSupplied && cfg?.serviceDescription) facts.push({ key: "description", value: cfg.serviceDescription.slice(0, 500), confidence: 95, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  if (ownerSupplied && cfg?.uniqueSellingPoints) facts.push({ key: "owner_note", value: cfg.uniqueSellingPoints.slice(0, 500), confidence: 95, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  if (ownerSupplied) {
    const city = firstToken(cfg?.targetScope);
    if (city && !/^(united states|global|worldwide)$/i.test(city)) facts.push({ key: "city", value: city, confidence: 92, stability: "stable", sourceSystem: "owner", sourceUrl: null });
  }

  // The location the owner typed when they ran their scan is authoritative user input
  // (never inferred). Country-level or empty values are ignored.
  {
    const [lastScan] = await db
      .select({ loc: scans.lookupLocation })
      .from(scans)
      .where(and(eq(scans.businessId, businessId), sql`coalesce(trim(${scans.lookupLocation}),'') <> ''`))
      .orderBy(desc(scans.createdAt))
      .limit(1);
    const city = firstToken(lastScan?.loc);
    if (city && !/^(united states|usa|us|global|worldwide|online|national)$/i.test(city)) {
      facts.push({ key: "city", value: city, confidence: 85, stability: "stable", sourceSystem: "scan_input", sourceUrl: null });
    }
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
  for (const g of gsc) {
    facts.push({ key: "search_demand", value: `${g.keyword} (${g.impressions} impressions/30d)`, confidence: 90, stability: "time_sensitive", sourceSystem: "gsc", sourceUrl: null, expiresAt: new Date(Date.now() + 45 * DAY) });
  }

  // Company's own website + sitemap.
  let crawl: CrawlResult = { facts: [], homepageOk: false, pagesRequested: 0, pagesChanged: 0, pagesNotModified: 0, changedUrls: [], unchangedUrls: [], note: "no_website" };
  if (biz.website) crawl = await crawlWebsite(db, businessId, biz.website, mode);
  facts.push(...crawl.facts);

  const stats = await persistFacts(db, businessId, facts, {
    // Only a complete, deep crawl is trusted to retire facts a site stopped stating.
    complete: mode === "deep" && crawl.homepageOk,
    changedUrls: crawl.changedUrls,
    unchangedUrls: crawl.unchangedUrls,
  });

  await db.insert(jobs).values({
    businessId,
    type: "truth_refresh",
    status: crawl.homepageOk ? "completed" : "partial",
    payload: {
      mode,
      ...stats,
      homepageOk: crawl.homepageOk,
      pagesRequested: crawl.pagesRequested,
      pagesChanged: crawl.pagesChanged,
      pagesNotModified: crawl.pagesNotModified,
      note: crawl.note,
      factsSeen: facts.length,
      modelCalls: 0,
    },
  });

  return { ok: true, mode, homepageOk: crawl.homepageOk, pagesRequested: crawl.pagesRequested, pagesChanged: crawl.pagesChanged, pagesNotModified: crawl.pagesNotModified, ...stats, modelCalls: 0, note: crawl.note };
}

export type TruthFact = {
  key: FactKey;
  value: string;
  sourceSystem: string;
  sourceUrl: string | null;
  fetchedAt: Date;
  sourceUpdatedAt: Date | null;
  expiresAt: Date | null;
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
  const usable: TruthFact[] = rows
    .filter((r) => {
      // Expired information is never usable — an old event/offer/news item must not read as current.
      if (r.expiresAt && r.expiresAt.getTime() < now) return false;
      const ref = (r.sourceUpdatedAt ?? r.fetchedAt).getTime();
      if (r.stability === "time_sensitive" && now - ref > TIME_SENSITIVE_MAX_AGE_DAYS * DAY) return false;
      return true;
    })
    .map((r) => ({
      key: r.factKey as FactKey,
      value: r.factValue,
      sourceSystem: r.sourceSystem,
      sourceUrl: r.sourceUrl,
      fetchedAt: r.fetchedAt,
      sourceUpdatedAt: r.sourceUpdatedAt,
      expiresAt: r.expiresAt,
      confidence: r.confidence,
      stability: r.stability,
    }));

  const websiteFacts = rows.filter((r) => r.sourceSystem === "website" || r.sourceSystem === "sitemap");
  const lastWebsiteCrawlAt = websiteFacts.length ? new Date(Math.max(...websiteFacts.map((r) => r.fetchedAt.getTime()))) : null;
  const staleWebsite = lastWebsiteCrawlAt ? now - lastWebsiteCrawlAt.getTime() > STABLE_STALE_AFTER_DAYS * DAY : true;

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
  const offers = usable.filter((f) => f.key === "offer" || f.key === "event");
  if (offers.length) lines.push(`Current offers/events (each is valid ONLY until its stated end date; never mention anything else as current): ${offers.map((f) => f.value).join("; ")}`);
  const recent = usable
    .filter((f) => f.key === "recent_content")
    .sort((a, b) => (b.sourceUpdatedAt ?? b.fetchedAt).getTime() - (a.sourceUpdatedAt ?? a.fetchedAt).getTime())
    .slice(0, 5);
  if (recent.length) {
    lines.push(
      `Recent pages on the company's website (some sites republish third-party news or alerts; never present these as company announcements, awards or accomplishments): ${recent
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
    "RULES: State facts about this business ONLY if they appear above. If something is not listed (services, locations, hours, prices, promotions, staff, years in business, awards, projects, statistics, customer stories), do not mention it and do not imply it. Prefer the most recent items. Never present an offer or event as current unless it is listed under current offers/events. Never present general web knowledge as a fact about this company.",
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

async function lastRefresh(db: Db, businessId: string): Promise<{ any: Date | null; deep: Date | null }> {
  const rows = await db
    .select({ createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "truth_refresh")))
    .orderBy(desc(jobs.createdAt))
    .limit(20);
  const anyRow = rows[0]?.createdAt ?? null;
  const deepRow = rows.find((r) => (r.payload as { mode?: string } | null)?.mode !== "light")?.createdAt ?? null;
  return { any: anyRow, deep: deepRow };
}

/** Light-refresh (conditional, cheap) when the last refresh is over a day old; deep when the last deep is over a week old. */
export async function ensureFreshTruth(businessId: string, maxAgeHours = 24): Promise<BusinessTruth> {
  const db = getDb();
  if (db) {
    const last = await lastRefresh(db, businessId);
    const stale = !last.any || Date.now() - last.any.getTime() > maxAgeHours * 3_600_000;
    if (stale) {
      const deepDue = !last.deep || Date.now() - last.deep.getTime() > 7 * DAY;
      try {
        await refreshBusinessTruth(businessId, deepDue ? "deep" : "light");
      } catch (err) {
        console.error("[truth] refresh failed", { businessId, error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  return getBusinessTruth(businessId);
}

/** Daily batch — every non-free business: light when stale (>20h), deep when the last deep is over a week old. */
export async function runTruthRefreshBatch(batchSize = 12): Promise<{ light: number; deep: number; modelCalls: 0 }> {
  const db = getDb();
  if (!db) return { light: 0, deep: 0, modelCalls: 0 };
  const paid = await db.select({ id: businesses.id }).from(businesses).where(notInArray(businesses.planTier, ["free"])).limit(500);
  const due: { id: string; deep: boolean; last: number }[] = [];
  for (const b of paid) {
    const last = await lastRefresh(db, b.id);
    const ageMs = last.any ? Date.now() - last.any.getTime() : Infinity;
    if (ageMs < 20 * 3_600_000) continue;
    due.push({ id: b.id, deep: !last.deep || Date.now() - last.deep.getTime() > 6.5 * DAY, last: last.any?.getTime() ?? 0 });
  }
  due.sort((a, b) => a.last - b.last);
  let light = 0;
  let deep = 0;
  for (const d of due.slice(0, batchSize)) {
    try {
      await refreshBusinessTruth(d.id, d.deep ? "deep" : "light");
      if (d.deep) deep++;
      else light++;
    } catch (err) {
      console.error("[truth] batch refresh failed", { businessId: d.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { light, deep, modelCalls: 0 };
}

const ALERT_WORDS = /\b(warning|advisory|watch|alert|cancel(?:l)?ed|closure|closed|recall|obituary|arrest|lawsuit)\b/i;
const OWN_VOICE_PATH = /\/(blog|projects?|portfolio|gallery|case-stud(?:y|ies)|events?|updates?|stories|articles?)\//i;

/**
 * Recent pages that are safe to PROMOTE in the company's own voice (social,
 * Google posts, outreach). Excludes /news/ pages (many sites republish
 * third-party news feeds), anything that reads as an alert or warning, and
 * anything older than 60 days — a stale story is never presented as fresh.
 */
export function promotableContent(facts: TruthFact[]): TruthFact[] {
  const cutoff = Date.now() - 60 * DAY;
  return facts
    .filter(
      (f) =>
        f.key === "recent_content" &&
        f.sourceUrl &&
        OWN_VOICE_PATH.test(f.sourceUrl) &&
        !ALERT_WORDS.test(f.value) &&
        (f.sourceUpdatedAt ?? f.fetchedAt).getTime() >= cutoff,
    )
    .sort((a, b) => (b.sourceUpdatedAt ?? b.fetchedAt).getTime() - (a.sourceUpdatedAt ?? a.fetchedAt).getTime());
}

/** Current (non-expired) offers/events that may be promoted. */
export function currentOffers(facts: TruthFact[]): TruthFact[] {
  const now = Date.now();
  return facts.filter((f) => (f.key === "offer" || f.key === "event") && (!f.expiresAt || f.expiresAt.getTime() > now));
}
