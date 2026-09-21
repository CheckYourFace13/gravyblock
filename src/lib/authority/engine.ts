/**
 * Authority engine — legitimate, permission-based link/mention acquisition.
 *
 * This is NOT link spam: nothing here creates links itself, posts in
 * comments/forums/profiles, buys links, or mass-blasts a template. It finds
 * real, relevant organizations (chambers, associations, local news, niche
 * blogs, government resource pages), reads a REAL published contact address
 * from their own site (never a guessed inbox), pitches ONE genuinely useful
 * page from the company's own website (chosen from the Business Truth layer),
 * follows up once, and then CHECKS the prospect's site to see whether a link
 * or mention actually appeared. "Outreach sent" is never reported as a
 * backlink — only a link found on the prospect's page counts as acquired.
 *
 * Lifecycle (backlink_opportunities.status):
 *   prospecting → qualified | no_contact | not_relevant
 *   qualified → contacted → followed_up → expired
 *   any contacted state → acquired (link verified on the prospect's site) | unsubscribed
 * Every transition is also written as a jobs row of type "authority_event"
 * (evidence trail: when, what, exact URLs).
 */

import { recordProof } from "@/lib/proof/ledger";
import { getOperatingMode } from "@/lib/business-mode";
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { backlinkOpportunities, businesses, getDb, jobs } from "@/lib/db";
import { ensureFreshTruth, promotableContent, type BusinessTruth } from "@/lib/truth";
import { discoverContactEmail } from "@/lib/outreach/discover-contact-email";
import { isOptedOut, coldOutreachFooter } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";
import { checkOutreachHealth } from "@/lib/outreach/outreach-health";
import { getRemainingSharedBudget } from "@/lib/outreach/send-budget";
import { safeFetchText, isSafePublicUrl } from "@/lib/net/safe-fetch";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";

export const AUTHORITY_SENT_JOB = "authority_outreach_sent";
export const AUTHORITY_FOLLOWUP_JOB = "authority_followup_sent";
const EVENT_JOB = "authority_event";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const MAX_NEW_SENDS_PER_BUSINESS_PER_RUN = 2;
const MAX_NEW_SENDS_PER_BUSINESS_PER_WEEK = 3;
const MAX_PROSPECTS_PER_BUSINESS_PER_MONTH = 12;
const FOLLOWUP_AFTER_DAYS = 7;
const EXPIRE_AFTER_DAYS = 21;

type Db = NonNullable<ReturnType<typeof getDb>>;
type SourceType = "chamber" | "association" | "local_news" | "blog" | "government";

const RELEVANT_SOURCE_TYPES: SourceType[] = ["chamber", "association", "local_news", "blog", "government"];
const BLOCKED_DOMAINS = /(facebook|instagram|yelp|linkedin|twitter|x|tiktok|youtube|pinterest|reddit|quora|wikipedia|google|bing|amazon|angi|thumbtack|groupon|nextdoor|mapquest|yellowpages|bbb)\./i;

const AUDIENCE: Record<SourceType, string> = {
  chamber: "members",
  association: "members",
  local_news: "readers",
  blog: "readers",
  government: "residents",
};

function domainOf(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

async function logEvent(db: Db, businessId: string, opportunityId: string, event: string, extra: Record<string, unknown> = {}) {
  await db.insert(jobs).values({ businessId, type: EVENT_JOB, status: "completed", payload: { opportunityId, event, at: new Date().toISOString(), ...extra } });
}

function classify(name: string, types: string[]): { sourceType: SourceType; score: number } | null {
  const n = name.toLowerCase();
  const t = new Set(types);
  if (n.includes("chamber") || n.includes("commerce")) return { sourceType: "chamber", score: 85 };
  if (t.has("local_government_office") || t.has("city_hall") || t.has("library")) return { sourceType: "government", score: 88 };
  if (n.includes("association") || n.includes("society") || n.includes("council") || n.includes("network") || n.includes("club")) return { sourceType: "association", score: 80 };
  if (n.includes("news") || n.includes("times") || n.includes("gazette") || n.includes("tribune") || n.includes("magazine") || n.includes("herald")) return { sourceType: "local_news", score: 78 };
  if (n.includes("blog") || n.includes("guide")) return { sourceType: "blog", score: 65 };
  return null; // anything else is noise (random shops that a text search returned)
}

type NewPlace = { displayName?: { text?: string }; formattedAddress?: string; websiteUri?: string; types?: string[] };

async function searchPlaces(textQuery: string): Promise<NewPlace[]> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.websiteUri,places.types",
      },
      body: JSON.stringify({ textQuery, pageSize: 8 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    return ((await res.json()) as { places?: NewPlace[] }).places ?? [];
  } catch {
    return [];
  }
}

/** The single most useful page on the company's OWN site to share, chosen from verified facts. */
/** Set once a receiving domain is live; replies then route to the reply handler instead of a person's inbox. */
export async function inboundReplyDomain(): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select({ payload: jobs.payload }).from(jobs).where(eq(jobs.type, "inbound_domain_ready")).orderBy(desc(jobs.createdAt)).limit(1);
  return (row?.payload as { domain?: string } | null)?.domain ?? null;
}

async function replyAddressFor(opportunityId: string, fallback: string): Promise<string> {
  const d = await inboundReplyDomain();
  return d ? `reply+${opportunityId}@${d}` : fallback;
}

export function chooseAuthorityAsset(truth: BusinessTruth, website: string | null) {
  return chooseAsset(truth, website);
}
function chooseAsset(truth: BusinessTruth, website: string | null): { url: string; title: string } | null {
  // A single venue's event listing is a poor thing to ask an association to share; prefer editorial pages.
  const recent = promotableContent(truth.facts).find((f) => f.sourceUrl && !/\/events?\//i.test(f.sourceUrl));
  if (recent?.sourceUrl) return { url: recent.sourceUrl, title: recent.value };
  const service = truth.facts.filter((f) => f.key === "service" && f.sourceUrl)[0];
  if (service?.sourceUrl) return { url: service.sourceUrl, title: service.value };
  if (website && truth.description) return { url: website, title: truth.businessName };
  return null;
}

/* ─────────────── 1. discovery + qualification ─────────────── */

export async function discoverAuthorityProspects(businessId: string): Promise<{ found: number; reason: string }> {
  const db = getDb();
  if (!db) return { found: 0, reason: "no_db" };

  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const [{ n: recentCount }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), gte(backlinkOpportunities.createdAt, monthAgo)));
  if (recentCount >= MAX_PROSPECTS_PER_BUSINESS_PER_MONTH) return { found: 0, reason: "monthly_prospect_cap_reached" };

  const truth = await ensureFreshTruth(businessId);
  if (!truth.sufficient) return { found: 0, reason: `insufficient_truth:${truth.insufficientReason}` };

  const [biz] = await db.select({ website: businesses.website }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const ownDomain = biz?.website ? domainOf(biz.website) : null;
  const bm = await getOperatingMode(businessId);
  const city = bm.mode === "local" ? bm.city : null;
  const topic = bm.category ?? truth.services[0] ?? null;

  // Queries follow the operating mode. Place-bound queries only with a verified place — never a guessed one.
  const queries: string[] = [];
  if (bm.mode === "local" && city) {
    queries.push(`chamber of commerce ${city}`, `${city} business association`, `${city} news`, `${city} community resources`);
    if (topic) queries.push(`${topic} association ${city}`, `${topic} blog ${city}`);
  } else if (bm.mode === "regional" && bm.placeLabel) {
    queries.push(`${bm.placeLabel} business association`, `${bm.placeLabel} news`);
    if (topic) queries.push(`${topic} association ${bm.placeLabel}`, `${topic} blog ${bm.placeLabel}`);
  } else if (topic) {
    // National / online: industry associations, resource directories and topical publications.
    queries.push(`${topic} association`, `${topic} industry council`, `${topic} resources directory`, `${topic} magazine`, `${topic} blog guide`);
  }
  if (queries.length === 0) return { found: 0, reason: "no_verified_location_or_topic_to_search" };

  const existing = await db.select({ targetUrl: backlinkOpportunities.targetUrl }).from(backlinkOpportunities).where(eq(backlinkOpportunities.businessId, businessId));
  const seenDomains = new Set(existing.map((e) => (e.targetUrl ? domainOf(e.targetUrl) : null)).filter((d): d is string => Boolean(d)));

  let found = 0;
  for (const q of queries) {
    if (found + recentCount >= MAX_PROSPECTS_PER_BUSINESS_PER_MONTH) break;
    for (const p of await searchPlaces(q)) {
      const name = p.displayName?.text;
      const site = p.websiteUri;
      if (!name || !site || !isSafePublicUrl(site)) continue;
      const dom = domainOf(site);
      if (!dom || dom === ownDomain || seenDomains.has(dom) || BLOCKED_DOMAINS.test(`${dom}.`)) continue;
      const cls = classify(name, p.types ?? []);
      if (!cls) continue;
      seenDomains.add(dom);
      await db.insert(backlinkOpportunities).values({
        id: randomUUID(),
        businessId,
        sourceName: name,
        sourceType: cls.sourceType,
        targetUrl: site,
        relevanceNote: `Found via "${q}"`,
        qualityScore: cls.score,
        status: "prospecting",
      });
      found++;
      if (found + recentCount >= MAX_PROSPECTS_PER_BUSINESS_PER_MONTH) break;
    }
  }
  await db.insert(jobs).values({ businessId, type: "authority_discovery", status: "completed", payload: { found, queries, city, topic } });
  return { found, reason: found ? "ok" : "no_relevant_prospects_found" };
}

/** Reads a real published contact address for prospecting rows; nothing is ever guessed. */
const STOP = new Set("game games gaming night nights league leagues play played bar bars software platform online competition competitions venue venues management signup signups payment payments tool tools event events player players team teams the and for you your our with that this from are was have has will can not but all any get find best top guide local business businesses services service company website site page pages online more about into over than help helps helping provide provides across around near nearby made makes make one new use used using their they them who what when where which while also just like only some such other each every many most much very".split(" "));

/** The business's own topical vocabulary, taken from its verified description/services (never invented). */
function topicVocabulary(truth: BusinessTruth, category: string | null): string[] {
  const text = [truth.description ?? "", ...truth.services, category ?? "", truth.facts.filter((f) => f.key === "page_topic").map((f) => f.value).join(" ")].join(" ").toLowerCase();
  const counts = new Map<string, number>();
  for (const w of text.match(/[a-z]{4,}/g) ?? []) {
    if (STOP.has(w)) continue;
    const stem = w.replace(/(ing|es|s)$/, "");
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([w]) => w);
}

/**
 * Real relevance, not just a name match: the prospect's own pages must actually touch the
 * business's topic (>=2 distinct topic words), or be a community/resource listing that
 * mentions the business's verified city AND at least one topic word.
 */
function assessRelevance(html: string, vocab: string[], city: string | null, minHits = 2): { relevant: boolean; note: string } {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").toLowerCase();
  const hits = vocab.filter((w) => new RegExp(`\\b${w}`).test(text));
  const resourceSection = /(resources?|partners?|member (benefits|resources)|community links|useful links|directory)/i.test(text);
  const cityHit = city ? text.includes(city.toLowerCase()) : false;
  if (hits.length >= minHits) return { relevant: true, note: `Prospect's own site covers: ${hits.slice(0, 5).join(", ")}` };
  if (resourceSection && cityHit && hits.length >= 1) return { relevant: true, note: `Has a resource listing in ${city} and mentions: ${hits[0]}` };
  return { relevant: false, note: `Prospect's site does not cover the business's topics (${hits.length} topic words matched)` };
}

async function qualifyProspects(db: Db, businessId: string, limit = 8, statuses: string[] = ["prospecting"]): Promise<number> {
  const rows = await db
    .select()
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), inArray(backlinkOpportunities.status, statuses)))
    .orderBy(desc(backlinkOpportunities.qualityScore))
    .limit(limit);
  if (rows.length === 0) return 0;
  const truth = await ensureFreshTruth(businessId);
  const [catJob] = await db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "category_derived"))).orderBy(desc(jobs.createdAt)).limit(1);
  const mode = await getOperatingMode(businessId);
  const vocab = topicVocabulary(truth, (catJob?.payload as { category?: string | null } | null)?.category ?? null);
  let qualified = 0;
  for (const r of rows) {
    if (!r.targetUrl || !RELEVANT_SOURCE_TYPES.includes(r.sourceType as SourceType)) {
      await db.update(backlinkOpportunities).set({ status: "not_relevant" }).where(eq(backlinkOpportunities.id, r.id));
      continue;
    }
    if (vocab.length >= 3) {
      const page = await safeFetchText(r.targetUrl, { timeoutMs: 9000 });
      const rel = page.ok && page.status < 400 ? assessRelevance(page.body, vocab, truth.verifiedCity, mode.mode === "local" || mode.mode === "regional" ? 2 : 4) : { relevant: false, note: "Prospect site could not be read" };
      if (!rel.relevant) {
        await db.update(backlinkOpportunities).set({ status: "not_relevant", relevanceNote: rel.note }).where(eq(backlinkOpportunities.id, r.id));
        await logEvent(db, businessId, r.id, "not_relevant", { note: rel.note });
        continue;
      }
      await db.update(backlinkOpportunities).set({ relevanceNote: rel.note }).where(eq(backlinkOpportunities.id, r.id));
    }
    const contact = await discoverContactEmail(r.targetUrl);
    if (!contact.email) {
      await db.update(backlinkOpportunities).set({ status: "no_contact", contactSource: contact.source }).where(eq(backlinkOpportunities.id, r.id));
      await logEvent(db, businessId, r.id, "no_published_contact", { source: contact.source });
      continue;
    }
    await db
      .update(backlinkOpportunities)
      .set({ status: "qualified", contactEmail: contact.email, contactSource: contact.source })
      .where(eq(backlinkOpportunities.id, r.id));
    await logEvent(db, businessId, r.id, "qualified", { contactSource: contact.source, discoverySourceUrl: contact.discoverySourceUrl });
    qualified++;
  }
  return qualified;
}

/** Re-run the current safety/relevance rules over prospects that qualified under older rules and have not been contacted. */
export async function requalifyProspects(businessId: string): Promise<{ rechecked: number; stillQualified: number }> {
  const db = getDb();
  if (!db) return { rechecked: 0, stillQualified: 0 };
  const rows = await db.select({ id: backlinkOpportunities.id }).from(backlinkOpportunities).where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "qualified")));
  const n = await qualifyProspects(db, businessId, 30, ["qualified"]);
  return { rechecked: rows.length, stillQualified: n };
}

/* ─────────────── 2. learning: which opportunity types actually produce links ─────────────── */

export type SourceTypeStats = Record<string, { contacted: number; acquired: number; rate: number }>;

export async function getSourceTypeStats(db: Db = getDb()!): Promise<SourceTypeStats> {
  const rows = await db
    .select({ sourceType: backlinkOpportunities.sourceType, status: backlinkOpportunities.status, n: sql<number>`count(*)::int` })
    .from(backlinkOpportunities)
    .groupBy(backlinkOpportunities.sourceType, backlinkOpportunities.status);
  const out: SourceTypeStats = {};
  for (const r of rows) {
    const s = (out[r.sourceType] ??= { contacted: 0, acquired: 0, rate: 0 });
    if (["contacted", "followed_up", "expired", "acquired", "unsubscribed"].includes(r.status)) s.contacted += r.n;
    if (r.status === "acquired") s.acquired += r.n;
  }
  for (const s of Object.values(out)) s.rate = (s.acquired + 1) / (s.contacted + 10); // smoothed so tiny samples don't dominate
  return out;
}

/* ─────────────── 3. pitch + send ─────────────── */

function replyToFor(biz: { accountType: string; accountEmail: string | null; billingEmail: string | null }, truth: BusinessTruth): string | null {
  if (biz.accountType === "house") return "chris@gravyblock.com";
  const truthEmail = truth.facts.find((f) => f.key === "email")?.value;
  return biz.accountEmail || biz.billingEmail || truthEmail || null;
}

/** First sentence(s) of the company's own description, ending on a complete sentence or word (never mid-word). */
function shortenAtSentence(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  const sentences = t.match(/[^.!?]+[.!?]/g) ?? [];
  let out = "";
  for (const sen of sentences) {
    if ((out + sen).trim().length > max) break;
    out = (out + sen).trim() + " ";
  }
  if (out.trim()) return out.trim().replace(/^\.\s*/, "");
  const cut = t.slice(0, max).replace(/\s+\S*$/, "");
  return cut.replace(/[,;:\s]+$/, "") + ".";
}

function fallbackPitch(input: { business: string; prospect: string; sourceType: SourceType; asset: { url: string; title: string }; description: string | null; city: string | null }): string {
  const audience = AUDIENCE[input.sourceType];
  return [
    `Hello ${input.prospect} team,`,
    "",
    `I'm writing on behalf of ${input.business}${input.city && !input.business.toLowerCase().includes(input.city.toLowerCase()) ? ` in ${input.city}` : ""}${input.description ? `. ${shortenAtSentence(input.description)}` : "."}`,
    "",
    `We recently put together this page that may be useful to your ${audience}: ${input.asset.title} — ${input.asset.url}`,
    "",
    `If you agree it would help, we'd be grateful if you'd consider mentioning or linking to it wherever it fits. If it isn't a fit, no problem at all, and thank you for what you do.`,
  ].join("\n");
}

async function buildPitch(truth: BusinessTruth, r: { sourceName: string; sourceType: string }, asset: { url: string; title: string }): Promise<string> {
  const sourceType = r.sourceType as SourceType;
  const fallback = fallbackPitch({ business: truth.businessName, prospect: r.sourceName, sourceType, asset, description: truth.description, city: truth.verifiedCity });
  const llm = await openRouterChat({
    model: MODELS.content,
    maxTokens: 260,
    temperature: 0.4,
    messages: [
      {
        role: "user",
        content: `${truth.promptBlock}\n\nWrite a short plain-text email (max 90 words) from the ${truth.businessName} team to "${r.sourceName}" (${r.sourceType.replace("_", " ")}). Purpose: share ONE genuinely useful resource for their ${AUDIENCE[sourceType]} and politely ask whether they'd consider mentioning or linking to it where relevant. The resource is this page on the company's own website: "${asset.title}" ${asset.url}\n\nRules: use only the verified facts; never claim you visited or admired their site; do not use the words "backlink", "SEO" or "link building"; no flattery; low-pressure; include the URL exactly once; no placeholders. Start with "Hello ${r.sourceName} team," and return only the email body.`,
      },
    ],
  }).catch(() => null);
  const body = llm?.trim();
  if (!body || body.length < 60 || body.length > 900 || !body.includes(asset.url) || containsPlaceholderArtifact(body)) return fallback;
  return body;
}

function fromAddress(): { name: string; email: string } | null {
  const raw = process.env.OUTREACH_FROM_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? "";
  const m = raw.match(/<([^>]+)>/) ?? raw.match(/([^\s<>]+@[^\s<>]+)/);
  return m?.[1] ? { name: "", email: m[1] } : null;
}

export async function sendAuthorityEmail(input: { businessId: string; to: string; subject: string; text: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "no_db" };
  const [biz] = await db.select({ name: businesses.name, accountType: businesses.accountType, accountEmail: businesses.accountEmail, billingEmail: businesses.billingEmail }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
  if (!biz) return { ok: false, error: "no_business" };
  if (await preflight(input.to)) return { ok: false, error: "suppressed" };
  const replyTo = biz.accountType === "house" ? "chris@gravyblock.com" : biz.accountEmail || biz.billingEmail;
  if (!replyTo) return { ok: false, error: "no_reply_to" };
  return sendPitch({ to: input.to, business: biz.name, subject: input.subject, text: input.text, replyTo });
}

async function sendPitch(input: { to: string; business: string; subject: string; text: string; replyTo: string }): Promise<{ ok: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = fromAddress();
  if (!apiKey || !from) return { ok: false, error: "resend_not_configured" };
  const footer = `\n\n--\nSent on behalf of ${input.business} by GravyBlock. Reply to this email to reach ${input.business} directly.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;white-space:pre-line">${input.text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")}${footer.replace(/&/g, "&amp;")}</div>${coldOutreachFooter(input.to)}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: `${input.business.replace(/[<>"]/g, "")} <${from.email}>`,
      to: [input.to],
      reply_to: input.replyTo,
      subject: input.subject,
      text: input.text + footer,
      html,
      tags: [{ name: "type", value: "authority_outreach" }],
    }),
  });
  if (!res.ok) return { ok: false, error: `resend_${res.status}` };
  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, id: body?.id };
}

async function sentThisWeek(db: Db, businessId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, AUTHORITY_SENT_JOB), gte(jobs.createdAt, since)));
  return row?.n ?? 0;
}

async function preflight(to: string): Promise<string | null> {
  if (await isOptedOut(to)) return "opted_out";
  const gate = await assertOutreachSendingAllowed(to);
  if (!gate.allowed) return gate.reason ?? "paused";
  return null;
}

async function sendInitialOutreach(db: Db, businessId: string, truth: BusinessTruth, stats: SourceTypeStats, budget: { left: number }): Promise<number> {
  const [biz] = await db
    .select({ website: businesses.website, accountType: businesses.accountType, accountEmail: businesses.accountEmail, billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) return 0;
  const replyTo = replyToFor(biz, truth);
  const asset = chooseAsset(truth, biz.website);
  if (!replyTo || !asset) {
    await db.insert(jobs).values({ businessId, type: "authority_blocked", status: "completed", payload: { reason: !replyTo ? "no_reply_to_address" : "no_linkable_asset_in_verified_facts" } });
    return 0;
  }
  const weekly = MAX_NEW_SENDS_PER_BUSINESS_PER_WEEK - (await sentThisWeek(db, businessId));
  const allowance = Math.min(MAX_NEW_SENDS_PER_BUSINESS_PER_RUN, weekly, budget.left);
  if (allowance <= 0) return 0;

  const candidates = await db
    .select()
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "qualified")))
    .limit(30);
  candidates.sort(
    (a, b) =>
      (b.qualityScore ?? 0) + 100 * (stats[b.sourceType]?.rate ?? 0) - ((a.qualityScore ?? 0) + 100 * (stats[a.sourceType]?.rate ?? 0)),
  );

  let sent = 0;
  for (const c of candidates) {
    if (sent >= allowance) break;
    if (!c.contactEmail) continue;
    const blocked = await preflight(c.contactEmail);
    if (blocked) {
      if (blocked === "opted_out") await db.update(backlinkOpportunities).set({ status: "unsubscribed" }).where(eq(backlinkOpportunities.id, c.id));
      continue;
    }
    const text = await buildPitch(truth, c, asset);
    const subject = `A resource for ${c.sourceName}`.slice(0, 120);
    const res = await sendPitch({ to: c.contactEmail, business: truth.businessName, subject, text, replyTo: await replyAddressFor(c.id, replyTo) });
    if (!res.ok) {
      await logEvent(db, businessId, c.id, "send_failed", { error: res.error });
      continue;
    }
    await db.update(backlinkOpportunities).set({ status: "contacted" }).where(eq(backlinkOpportunities.id, c.id));
    await db.insert(jobs).values({
      businessId,
      type: AUTHORITY_SENT_JOB,
      status: "completed",
      payload: { opportunityId: c.id, resendEmailId: res.id, to: c.contactEmail, sourceType: c.sourceType, assetUrl: asset.url, subject },
    });
    await logEvent(db, businessId, c.id, "outreach_sent", { resendEmailId: res.id, assetUrl: asset.url, targetUrl: c.targetUrl });
    sent++;
    budget.left--;
  }
  return sent;
}

async function sendFollowUps(db: Db, businessId: string, truth: BusinessTruth, budget: { left: number }): Promise<number> {
  if (budget.left <= 0) return 0;
  const [biz] = await db
    .select({ website: businesses.website, accountType: businesses.accountType, accountEmail: businesses.accountEmail, billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz) return 0;
  const replyTo = replyToFor(biz, truth);
  const asset = chooseAsset(truth, biz.website);
  if (!replyTo || !asset) return 0;

  const cutoff = new Date(Date.now() - FOLLOWUP_AFTER_DAYS * 86_400_000);
  const sentJobs = await db
    .select({ payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, AUTHORITY_SENT_JOB)));
  const due = sentJobs.filter((j) => j.createdAt <= cutoff).map((j) => j.payload as { opportunityId: string });

  let sent = 0;
  for (const d of due) {
    if (sent >= 2 || budget.left <= 0) break;
    const [opp] = await db.select().from(backlinkOpportunities).where(eq(backlinkOpportunities.id, d.opportunityId)).limit(1);
    if (!opp || opp.status !== "contacted" || !opp.contactEmail) continue; // acquired / unsubscribed / already followed up → stop
    if (await preflight(opp.contactEmail)) continue;
    const text = `Hello ${opp.sourceName} team,\n\nA quick follow-up on my note last week about ${asset.title} (${asset.url}) from ${truth.businessName}. If it would be useful to your ${AUDIENCE[opp.sourceType as SourceType] ?? "audience"}, we'd appreciate a mention; if not, no worries at all and I won't follow up again.\n\nThank you.`;
    const res = await sendPitch({ to: opp.contactEmail, business: truth.businessName, subject: `Re: A resource for ${opp.sourceName}`.slice(0, 120), text, replyTo: await replyAddressFor(opp.id, replyTo) });
    if (!res.ok) continue;
    await db.update(backlinkOpportunities).set({ status: "followed_up" }).where(eq(backlinkOpportunities.id, opp.id));
    await db.insert(jobs).values({ businessId, type: AUTHORITY_FOLLOWUP_JOB, status: "completed", payload: { opportunityId: opp.id, resendEmailId: res.id, to: opp.contactEmail } });
    await logEvent(db, businessId, opp.id, "followup_sent", { resendEmailId: res.id });
    sent++;
    budget.left--;
  }
  return sent;
}

/* ─────────────── 4. verification: was a link/mention actually acquired? ─────────────── */

const RESOURCE_PATH = /\/(resources?|partners?|links?|members?|directory|sponsors?|news|blog|community|businesses|listings?)(\/|$)/i;

export type LinkCheck = { linked: boolean; pageUrl?: string; href?: string; rel?: string; mentionedWithoutLink?: boolean };

export async function checkForLink(prospectSite: string, customerDomain: string, brandName: string): Promise<LinkCheck> {
  const home = await safeFetchText(prospectSite, { timeoutMs: 9000 });
  if (!home.ok || home.status >= 400) return { linked: false };
  const pages: { url: string; html: string }[] = [{ url: home.finalUrl, html: home.body }];
  const extra = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(home.body)) && extra.size < 4) {
    try {
      const abs = new URL(m[1]!, home.finalUrl).toString();
      if (domainOf(abs) === domainOf(home.finalUrl) && RESOURCE_PATH.test(new URL(abs).pathname) && abs !== home.finalUrl) extra.add(abs);
    } catch {
      /* ignore */
    }
  }
  for (const u of extra) {
    const r = await safeFetchText(u, { timeoutMs: 8000 });
    if (r.ok && r.status < 400) pages.push({ url: r.finalUrl, html: r.body });
  }
  let mention = false;
  for (const p of pages) {
    const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(p.html))) {
      const href = lm[1]!;
      let host: string | null = null;
      try {
        host = domainOf(new URL(href, p.url).toString());
      } catch {
        host = null;
      }
      if (host && host === customerDomain) {
        const rel = lm[0].match(/rel=["']([^"']+)["']/i)?.[1];
        return { linked: true, pageUrl: p.url, href, rel };
      }
    }
    if (brandName && p.html.toLowerCase().includes(brandName.toLowerCase())) mention = true;
  }
  return { linked: false, mentionedWithoutLink: mention };
}

export async function verifyAcquisitions(businessId: string, limit = 6): Promise<{ checked: number; acquired: number }> {
  const db = getDb();
  if (!db) return { checked: 0, acquired: 0 };
  const [biz] = await db.select({ website: businesses.website, name: businesses.name }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  const customerDomain = biz?.website ? domainOf(biz.website) : null;
  if (!customerDomain) return { checked: 0, acquired: 0 };

  const rows = await db
    .select()
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), inArray(backlinkOpportunities.status, ["contacted", "followed_up", "expired", "replied"])))
    .limit(limit);
  let acquired = 0;
  for (const r of rows) {
    if (!r.targetUrl) continue;
    const check = await checkForLink(r.targetUrl, customerDomain, biz?.name ?? "");
    if (check.linked) {
      await db
        .update(backlinkOpportunities)
        .set({ status: "acquired", relevanceNote: `Live link verified on ${check.pageUrl} → ${check.href}${check.rel ? ` (rel=${check.rel})` : ""}` })
        .where(eq(backlinkOpportunities.id, r.id));
      await logEvent(db, businessId, r.id, "link_acquired", { acquiredUrl: check.pageUrl, href: check.href, rel: check.rel ?? null, targetUrl: r.targetUrl });
      acquired++;
      await recordProof({
        businessId,
        actionType: "link_acquired",
        engine: "authority",
        proofCategory: "backlink",
        destination: check.pageUrl ?? r.targetUrl,
        summary: `GravyBlock earned a live backlink to the business's site from ${domainOf(check.pageUrl ?? r.targetUrl) ?? "a relevant local site"}, verified on the live page.`,
        afterEvidence: { referringDomain: domainOf(check.pageUrl ?? r.targetUrl), pageUrl: check.pageUrl, href: check.href, rel: check.rel ?? null },
        dedupeKey: `link_acquired:${r.id}`,
        findingType: "backlink",
      });
    } else if (check.mentionedWithoutLink) {
      await logEvent(db, businessId, r.id, "unlinked_mention_detected", { targetUrl: r.targetUrl });
    }
  }
  // Retire stale outreach after the final follow-up window.
  const expireBefore = new Date(Date.now() - EXPIRE_AFTER_DAYS * 86_400_000);
  const sentJobs = await db.select({ payload: jobs.payload, createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, AUTHORITY_SENT_JOB)));
  for (const j of sentJobs) {
    if (j.createdAt > expireBefore) continue;
    const id = (j.payload as { opportunityId?: string }).opportunityId;
    if (!id) continue;
    await db
      .update(backlinkOpportunities)
      .set({ status: "expired" })
      .where(and(eq(backlinkOpportunities.id, id), inArray(backlinkOpportunities.status, ["contacted", "followed_up"])));
  }
  return { checked: rows.length, acquired };
}

/* ─────────────── first-run review gate ─────────────── */

const SEND_PAUSED_JOB = "authority_send_paused";

/**
 * Real third-party email starts only after the first pitches have been
 * reviewed once (previewAuthorityOutreach) and enabled by the operator
 * (GravyBlock's engineer, one time, at rollout). After that it is fully
 * autonomous — this is a rollout safety gate, not a recurring approval step.
 */
/** Global kill switch only. Sending is otherwise governed per business by authorization (below), health and the shared budget. */
export async function authoritySendingEnabled(db: Db = getDb()!): Promise<boolean> {
  const [row] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, SEND_PAUSED_JOB)).limit(1);
  return !row;
}

/** Kept for compatibility; enabling is no longer required. */
export async function enableAuthoritySending(_note: string): Promise<void> {}

const AUTH_JOB = "outreach_authorization";

/** One-time authorization given in the terms accepted at checkout; idempotent. */
export async function recordOutreachAuthorization(businessId: string, source: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const [row] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, AUTH_JOB))).limit(1);
  if (row) return;
  await db.insert(jobs).values({ businessId, type: AUTH_JOB, status: "completed", payload: { source, termsVersion: "2026-09", at: new Date().toISOString() } });
}

/** House accounts are ours (policy authorization); customers need the one-time authorization from their terms. */
export async function isOutreachAuthorized(db: Db, businessId: string): Promise<boolean> {
  const [biz] = await db.select({ accountType: businesses.accountType }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  if (biz?.accountType === "house") return true;
  const [row] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, AUTH_JOB))).limit(1);
  const [revoked] = await db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.businessId, businessId), eq(jobs.type, "outreach_authorization_revoked"))).limit(1);
  return Boolean(row) && !revoked;
}

/** Exactly what would be sent next — subject, recipient, body, reply-to — without sending anything. */
export async function previewAuthorityOutreach(businessId: string, limit = 2): Promise<{ business: string; asset: { url: string; title: string } | null; replyTo: string | null; pitches: { to: string; prospect: string; sourceType: string; targetUrl: string | null; subject: string; body: string }[]; blocked?: string }> {
  const db = getDb();
  if (!db) return { business: "", asset: null, replyTo: null, pitches: [], blocked: "no_db" };
  const truth = await ensureFreshTruth(businessId);
  const [biz] = await db
    .select({ website: businesses.website, accountType: businesses.accountType, accountEmail: businesses.accountEmail, billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  if (!biz || !truth.sufficient) return { business: truth.businessName, asset: null, replyTo: null, pitches: [], blocked: truth.insufficientReason ?? "insufficient_truth" };
  const asset = chooseAsset(truth, biz.website);
  const replyTo = replyToFor(biz, truth);
  const rows = await db
    .select()
    .from(backlinkOpportunities)
    .where(and(eq(backlinkOpportunities.businessId, businessId), eq(backlinkOpportunities.status, "qualified")))
    .orderBy(desc(backlinkOpportunities.qualityScore))
    .limit(limit);
  const pitches = [];
  if (asset) {
    for (const r of rows) {
      if (!r.contactEmail) continue;
      pitches.push({ to: r.contactEmail, prospect: r.sourceName, sourceType: r.sourceType, targetUrl: r.targetUrl, subject: `A resource for ${r.sourceName}`, body: await buildPitch(truth, r, asset) });
    }
  }
  return { business: truth.businessName, asset, replyTo, pitches, blocked: !asset ? "no_linkable_asset" : !replyTo ? "no_reply_to" : undefined };
}

/** Run discovery + qualification only (network reads, no email) — used for rollout verification. */
export async function discoverAndQualify(businessId: string): Promise<{ discovery: { found: number; reason: string }; qualified: number }> {
  const db = getDb();
  if (!db) return { discovery: { found: 0, reason: "no_db" }, qualified: 0 };
  const discovery = await discoverAuthorityProspects(businessId);
  const qualified = await qualifyProspects(db, businessId, 12);
  return { discovery, qualified };
}

/* ─────────────── 5. batch + metrics ─────────────── */

export async function runAuthorityBatch(opts: { maxBusinesses?: number } = {}): Promise<{ businesses: number; found: number; qualified: number; sent: number; followUps: number; checked: number; acquired: number; skipped?: string }> {
  const out = { businesses: 0, found: 0, qualified: 0, sent: 0, followUps: 0, checked: 0, acquired: 0 };
  const db = getDb();
  if (!db) return out;

  const health = await checkOutreachHealth();
  const budget = { left: Math.min(6, await getRemainingSharedBudget()) };
  const enabled = await authoritySendingEnabled(db);
  const sendingOk = enabled && health.healthy && budget.left > 0; // per-business authorization is checked below

  const biz = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(200);
  const stats = await getSourceTypeStats(db);

  for (const b of biz.slice(0, opts.maxBusinesses ?? 10)) {
    out.businesses++;
    try {
      // discovery weekly per business
      const [lastDiscovery] = await db
        .select({ createdAt: jobs.createdAt })
        .from(jobs)
        .where(and(eq(jobs.businessId, b.id), eq(jobs.type, "authority_discovery")))
        .orderBy(desc(jobs.createdAt))
        .limit(1);
      if (!lastDiscovery || Date.now() - lastDiscovery.createdAt.getTime() > 7 * 86_400_000) {
        out.found += (await discoverAuthorityProspects(b.id)).found;
      }
      out.qualified += await qualifyProspects(db, b.id);
      const v = await verifyAcquisitions(b.id);
      out.checked += v.checked;
      out.acquired += v.acquired;
      if (sendingOk && (await isOutreachAuthorized(db, b.id))) {
        const truth = await ensureFreshTruth(b.id);
        if (truth.sufficient) {
          out.followUps += await sendFollowUps(db, b.id, truth, budget);
          out.sent += await sendInitialOutreach(db, b.id, truth, stats, budget);
        }
      }
    } catch (err) {
      console.error("[authority] business run failed", { businessId: b.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  await db.insert(jobs).values({ type: "authority_batch", status: "completed", payload: { ...out, sendingOk, health: health.healthy ? "ok" : health.reason } });
  return out;
}

export type AuthorityStats = {
  prospectsFound: number;
  withPublishedContact: number;
  outreachSent: number;
  followUpsSent: number;
  liveLinksAcquired: number;
  unlinkedMentions: number;
  bySourceType: SourceTypeStats;
  acquiredLinks: { businessId: string; sourceName: string; note: string | null; targetUrl: string | null }[];
};

export async function getAuthorityStats(businessId?: string): Promise<AuthorityStats> {
  const db = getDb();
  const empty: AuthorityStats = { prospectsFound: 0, withPublishedContact: 0, outreachSent: 0, followUpsSent: 0, liveLinksAcquired: 0, unlinkedMentions: 0, bySourceType: {}, acquiredLinks: [] };
  if (!db) return empty;
  const scope = businessId ? eq(backlinkOpportunities.businessId, businessId) : sql`true`;
  const rows = await db.select({ status: backlinkOpportunities.status, n: sql<number>`count(*)::int` }).from(backlinkOpportunities).where(scope).groupBy(backlinkOpportunities.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const total = rows.reduce((a, r) => a + r.n, 0);
  const jobScope = businessId ? eq(jobs.businessId, businessId) : sql`true`;
  const count = async (type: string) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(jobs).where(and(jobScope, eq(jobs.type, type)));
    return r?.n ?? 0;
  };
  const [mentions] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(jobScope, eq(jobs.type, EVENT_JOB), sql`${jobs.payload}->>'event' = 'unlinked_mention_detected'`));
  const acquiredRows = await db
    .select({ businessId: backlinkOpportunities.businessId, sourceName: backlinkOpportunities.sourceName, note: backlinkOpportunities.relevanceNote, targetUrl: backlinkOpportunities.targetUrl })
    .from(backlinkOpportunities)
    .where(and(scope, eq(backlinkOpportunities.status, "acquired")))
    .limit(50);
  return {
    prospectsFound: total,
    withPublishedContact: total - (by.prospecting ?? 0) - (by.no_contact ?? 0) - (by.not_relevant ?? 0),
    outreachSent: await count(AUTHORITY_SENT_JOB),
    followUpsSent: await count(AUTHORITY_FOLLOWUP_JOB),
    liveLinksAcquired: by.acquired ?? 0,
    unlinkedMentions: mentions?.n ?? 0,
    bySourceType: await getSourceTypeStats(db),
    acquiredLinks: acquiredRows.map((a) => ({ businessId: a.businessId ?? "", sourceName: a.sourceName, note: a.note, targetUrl: a.targetUrl })),
  };
}
