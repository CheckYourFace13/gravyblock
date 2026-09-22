/**
 * Citation engine — replaces the old "one generic 'Verify listing on X' task per
 * directory, every month, for the customer to work through" flow.
 *
 * For every target in the registry it records an honest per-business status in
 * citation_monitors and does the checks that are legitimately possible with no
 * recurring customer work:
 *   • first-party consistency: name/phone/address on the company's own site vs
 *     its Google profile vs owner-supplied data (Business Truth layer)
 *   • Yelp: detect the listing through the free Fusion match API and compare NAP
 *   • Facebook Page: compare Page details via the Page access the owner already authorized
 * Everything that needs an owner login/verification, forbids automation, or is
 * a paid provider is recorded as unsupported for no-touch automation — it does
 * NOT become a task for the customer.
 *
 * Statuses: consistent | drift_detected | not_found | unsupported_no_touch | needs_one_time_authorization
 */

import { and, eq, inArray } from "drizzle-orm";
import { businessConfigs, businesses, citationMonitors, getDb, jobs, operatorTasks } from "@/lib/db";
import { ensureFreshTruth, type BusinessTruth } from "@/lib/truth";
import { targetsFor, automationClassFor, SUBMITTERS, type CitationTarget } from "./registry";
import { citationListings } from "@/lib/db";
import { recordOpportunity } from "@/lib/opportunities/queue";

type Db = NonNullable<ReturnType<typeof getDb>>;

const digits = (s: string) => s.replace(/\D/g, "").slice(-10);
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const nameKey = (s: string) => alnum(s).replace(/\b(llc|inc|co|corp|ltd|the)\b/g, "").replace(/\s+/g, " ").trim();
const addrKey = (s: string) => alnum(s).split(" ").slice(0, 3).join(" "); // street number + first street words

function distinct(values: string[], norm: (s: string) => string): string[] {
  return [...new Set(values.map(norm).filter(Boolean))];
}

export function firstPartyDrift(truth: BusinessTruth): string[] {
  const issues: string[] = [];
  const by = (key: string) => truth.facts.filter((f) => f.key === key);
  const check = (key: string, label: string, norm: (s: string) => string) => {
    const facts = by(key);
    if (distinct(facts.map((f) => f.value), norm).length > 1) {
      issues.push(`${label} differs between sources: ${facts.map((f) => `"${f.value}" (${f.sourceSystem})`).join(" vs ")}`);
    }
  };
  check("phone", "Phone", digits);
  check("address", "Address", addrKey);
  check("name", "Business name", nameKey);
  return issues;
}

async function upsert(db: Db, businessId: string, sourceName: string, status: string, listingUrl: string | null, note: string) {
  const stamp = `[checked ${new Date().toISOString().slice(0, 10)}] ${note}`;
  const [existing] = await db
    .select({ id: citationMonitors.id })
    .from(citationMonitors)
    .where(and(eq(citationMonitors.businessId, businessId), eq(citationMonitors.sourceName, sourceName)))
    .limit(1);
  if (existing) await db.update(citationMonitors).set({ status, listingUrl, mismatchNote: stamp }).where(eq(citationMonitors.id, existing.id));
  else await db.insert(citationMonitors).values({ businessId, sourceName, status, listingUrl, mismatchNote: stamp });
}

function canonicalNap(truth: BusinessTruth): string {
  const best = (k: string) => truth.facts.filter((f) => f.key === k).sort((a, b) => b.confidence - a.confidence)[0]?.value ?? "";
  return [truth.businessName, best("phone"), best("address")].filter(Boolean).join(" | ");
}

/** Persist the actual listing state per directory with its A-E automation class. Nothing is marked submitted/verified unless an external check confirmed it. */
async function persistListing(db: Db, businessId: string, t: CitationTarget, truth: BusinessTruth, result: { status: string; url: string | null; note: string }) {
  const cls = automationClassFor(t);
  let status: string;
  if (cls === "E") status = "unsupported";
  else if (result.status === "consistent") status = "found_consistent";
  else if (result.status === "drift_detected") status = "drift_detected";
  else if (result.status === "not_found") status = cls === "D" ? "needs_one_time_verification" : "not_found";
  else if (result.status === "needs_one_time_authorization") status = "needs_one_time_authorization";
  else status = cls === "D" ? "needs_one_time_verification" : "unsupported";
  let submittedAt: Date | null = null;
  let verifiedAt: Date | null = null;
  // Class C: submit automatically where a handler exists; verified only after a re-check finds the listing.
  if (cls === "C" && SUBMITTERS[t.id] && status !== "found_consistent") {
    const sub = await SUBMITTERS[t.id]!({ name: truth.businessName, website: undefined }).catch(() => ({ ok: false }));
    if (sub.ok) {
      submittedAt = new Date();
      status = "submitted";
    }
  }
  if (status === "found_consistent" && t.id !== "own_site_vs_gbp") verifiedAt = new Date();
  const values = {
    businessId,
    directoryId: t.id,
    directoryName: t.name,
    automationClass: cls,
    listingUrl: result.url,
    canonicalValue: canonicalNap(truth),
    status,
    verificationRequirement: cls === "D" ? t.reason : cls === "B" && status === "needs_one_time_authorization" ? "One-time connection" : null,
    lastCheckedAt: new Date(),
    ...(submittedAt ? { submittedAt } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
  };
  const [existing] = await db.select({ id: citationListings.id }).from(citationListings).where(and(eq(citationListings.businessId, businessId), eq(citationListings.directoryId, t.id))).limit(1);
  if (existing) await db.update(citationListings).set(values).where(eq(citationListings.id, existing.id));
  else await db.insert(citationListings).values(values);

  if (cls === "D" && (status === "needs_one_time_verification" || status === "not_found")) {
    await recordOpportunity({
      businessId,
      opportunityType: "citation",
      engine: "citation_engine",
      evidence: { directory: t.name, directoryId: t.id, automationClass: cls, note: result.note },
      expectedImpact: Math.round(t.authority * 0.5),
      confidence: 60,
      cost: 2,
      risk: 1,
      requiredCapability: null,
      autoEligible: false, // class D needs a one-time human verification step by design
      dedupeKey: `citation_gap:${businessId}:${t.id}`,
    }).catch(() => undefined);
  }
}

async function checkYelp(truth: BusinessTruth): Promise<{ status: string; url: string | null; note: string }> {
  const key = process.env.YELP_API_KEY;
  if (!key) return { status: "unsupported_no_touch", url: null, note: "Yelp API key not configured; detection unavailable." };
  const addr = truth.facts.filter((f) => f.key === "address").sort((a, b) => b.confidence - a.confidence)[0]?.value;
  const parts = (addr ?? "").split(",").map((p) => p.trim());
  if (!addr || parts.length < 3) return { status: "unsupported_no_touch", url: null, note: "Needs a full street address to match a Yelp listing." };
  const [street, city, stateZip] = [parts[0]!, parts[1]!, parts[2]!];
  const state = stateZip.split(/\s+/)[0] ?? "";
  const params = new URLSearchParams({ name: truth.businessName, address1: street, city, state, country: "US" });
  try {
    const res = await fetch(`https://api.yelp.com/v3/businesses/matches?${params}`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { status: "unsupported_no_touch", url: null, note: `Yelp lookup unavailable (HTTP ${res.status}).` };
    const match = ((await res.json()) as { businesses?: { id: string; name: string; alias: string; phone?: string; location?: { display_address?: string[] } }[] }).businesses?.[0];
    if (!match) return { status: "not_found", url: null, note: "No Yelp listing matched the company's name and address. Creating/claiming one requires the owner's Yelp login." };
    const phone = truth.facts.filter((f) => f.key === "phone").sort((a, b) => b.confidence - a.confidence)[0]?.value;
    const drift: string[] = [];
    if (phone && match.phone && digits(phone) !== digits(match.phone)) drift.push(`phone on Yelp ${match.phone} vs ${phone}`);
    if (nameKey(match.name) !== nameKey(truth.businessName)) drift.push(`name on Yelp "${match.name}"`);
    return {
      status: drift.length ? "drift_detected" : "consistent",
      url: `https://www.yelp.com/biz/${match.alias}`,
      note: drift.length ? `Differences: ${drift.join("; ")}. Fixing requires the owner's Yelp login.` : "Listing found; NAP matches.",
    };
  } catch (err) {
    return { status: "unsupported_no_touch", url: null, note: `Yelp lookup failed: ${err instanceof Error ? err.message : "error"}` };
  }
}

async function checkFacebook(db: Db, businessId: string, truth: BusinessTruth): Promise<{ status: string; url: string | null; note: string }> {
  const [cfg] = await db.select({ pageId: businessConfigs.facebookPageId, token: businessConfigs.facebookAccessToken }).from(businessConfigs).where(eq(businessConfigs.businessId, businessId)).limit(1);
  if (!cfg?.pageId || !cfg.token) return { status: "needs_one_time_authorization", url: null, note: "Connect a Facebook Page once and GravyBlock will check it automatically." };
  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${cfg.pageId}?fields=name,phone,single_line_address,website,link&access_token=${encodeURIComponent(cfg.token)}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { status: "needs_one_time_authorization", url: null, note: "Facebook rejected the saved Page access; reconnect once to resume checks." };
    const page = (await res.json()) as { name?: string; phone?: string; single_line_address?: string; link?: string };
    const phone = truth.facts.filter((f) => f.key === "phone").sort((a, b) => b.confidence - a.confidence)[0]?.value;
    const drift: string[] = [];
    if (phone && page.phone && digits(phone) !== digits(page.phone)) drift.push(`phone on Facebook ${page.phone} vs ${phone}`);
    if (page.name && nameKey(page.name) !== nameKey(truth.businessName)) drift.push(`Page name "${page.name}"`);
    return { status: drift.length ? "drift_detected" : "consistent", url: page.link ?? null, note: drift.length ? drift.join("; ") : "Page details match." };
  } catch (err) {
    return { status: "needs_one_time_authorization", url: null, note: `Facebook check failed: ${err instanceof Error ? err.message : "error"}` };
  }
}

export async function runCitationEngineForBusiness(businessId: string): Promise<{ targets: number; drift: number; consistent: number; unsupported: number }> {
  const db = getDb();
  if (!db) return { targets: 0, drift: 0, consistent: 0, unsupported: 0 };

  const [biz] = await db
    .select({ vertical: businesses.vertical, primaryCategory: businesses.primaryCategory, googleMapsUri: businesses.googleMapsUri, placeId: businesses.placeId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);
  const truth = await ensureFreshTruth(businessId);
  const targets: CitationTarget[] = targetsFor(biz?.vertical ?? biz?.primaryCategory);
  let drift = 0;
  let consistent = 0;
  let unsupported = 0;

  for (const t of targets) {
    let result: { status: string; url: string | null; note: string };
    if (t.id === "own_site_vs_gbp") {
      const issues = firstPartyDrift(truth);
      result = truth.facts.length
        ? { status: issues.length ? "drift_detected" : "consistent", url: null, note: issues.length ? issues.join(" | ") : "Name, phone and address agree across the company's website, Google profile and owner data." }
        : { status: "unsupported_no_touch", url: null, note: "No first-party data captured yet." };
    } else if (t.id === "google_business_profile") {
      result = biz?.placeId
        ? { status: "consistent", url: biz.googleMapsUri ?? null, note: "Google listing matched to this business." }
        : { status: "needs_one_time_authorization", url: null, note: "No confident Google listing match; connect Google once so GravyBlock can read the profile." };
    } else if (t.id === "yelp") result = await checkYelp(truth);
    else if (t.id === "facebook_page") result = await checkFacebook(db, businessId, truth);
    else {
      result = { status: "unsupported_no_touch", url: t.url || null, note: `${t.reason}${t.automation === "paid_provider" ? " (paid provider — not enabled)" : ""}` };
    }
    await upsert(db, businessId, t.name, result.status, result.url, result.note);
    await persistListing(db, businessId, t, truth, result);
    if (result.status === "drift_detected") drift++;
    else if (result.status === "consistent") consistent++;
    else if (result.status === "unsupported_no_touch") unsupported++;
  }

  // The old generic "Verify listing on X" checklist is superseded — it was a
  // recurring to-do list for the owner with no per-directory check behind it.
  await db
    .update(operatorTasks)
    .set({ status: "superseded" })
    .where(and(eq(operatorTasks.businessId, businessId), eq(operatorTasks.queue, "citation_ops"), inArray(operatorTasks.status, ["queued", "pending"])));

  await db.insert(jobs).values({ businessId, type: "citation_engine_run", status: "completed", payload: { targets: targets.length, drift, consistent, unsupported } });
  return { targets: targets.length, drift, consistent, unsupported };
}

/** Monthly per paid business; oldest first. */
export async function runCitationEngineBatch(batchSize = 5): Promise<{ ran: number }> {
  const db = getDb();
  if (!db) return { ran: 0 };
  const paid = await db.select({ id: businesses.id }).from(businesses).limit(300);
  const due: { id: string; last: number }[] = [];
  const monthAgo = Date.now() - 28 * 86_400_000;
  for (const b of paid) {
    const runs = await db.select({ createdAt: jobs.createdAt }).from(jobs).where(and(eq(jobs.businessId, b.id), eq(jobs.type, "citation_engine_run")));
    const last = runs.reduce((m, r) => Math.max(m, r.createdAt.getTime()), 0);
    if (last < monthAgo) due.push({ id: b.id, last });
  }
  due.sort((a, b) => a.last - b.last);
  let ran = 0;
  for (const d of due.slice(0, batchSize)) {
    try {
      const [biz] = await db.select({ planTier: businesses.planTier }).from(businesses).where(eq(businesses.id, d.id)).limit(1);
      if (!biz || biz.planTier === "free") continue;
      await runCitationEngineForBusiness(d.id);
      ran++;
    } catch (err) {
      console.error("[citation-engine] failed", { businessId: d.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ran };
}
