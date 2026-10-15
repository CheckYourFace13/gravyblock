import { and, eq, inArray, or, sql } from "drizzle-orm";
import { getDb, businesses, jobs } from "@/lib/db";

/**
 * One deterministic definition of "not a real customer or real acquisition": owner/staff accounts, QA and test
 * businesses, and owner-operated (house) accounts. Records are never deleted; they are classified, and every
 * customer, MRR, conversion and acquisition number excludes them.
 *
 * Classification is computed from facts on the row (never guessed from behavior) and is also recorded once as an
 * `internal_account` marker in the jobs table so the decision is visible and auditable. It deliberately does not
 * rewrite `businesses.account_type`, which other automation reads.
 */

export const INTERNAL_EMAIL_DOMAINS = ["gravyblock.com", "iscreamstudio.com"];
export const TEST_EMAIL_DOMAINS = ["example.com", "example.org", "example.net", "test.com"];
const TEST_NAME = /\btest (control )?co\b|\bqa\b|\btest business\b/i;
const TEST_LOCAL_PART = /funnel-test|conversion-test|journey-test|\+test\b|^test(er)?@/i;

export type ClassifiableBusiness = {
  id: string;
  name: string;
  accountType: string | null;
  billingEmail: string | null;
  accountEmail: string | null;
  websiteNormalized: string | null;
};

const domainOf = (email: string | null) => (email ?? "").toLowerCase().split("@")[1] ?? "";

/** Returns why a business is internal, or null if it looks like a real outside business. */
export function internalReason(b: ClassifiableBusiness): string | null {
  const selfId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID?.trim();
  if (selfId && b.id === selfId) return "gravyblock_self_account";
  if (b.accountType === "house") return "house_account";
  for (const email of [b.billingEmail, b.accountEmail]) {
    const d = domainOf(email);
    if (INTERNAL_EMAIL_DOMAINS.includes(d)) return "owner_or_staff_email";
    if (TEST_EMAIL_DOMAINS.includes(d)) return "test_email_domain";
    if (email && TEST_LOCAL_PART.test(email.toLowerCase())) return "test_email_address";
  }
  if (b.websiteNormalized && TEST_EMAIL_DOMAINS.includes(b.websiteNormalized)) return "test_website";
  if (TEST_NAME.test(b.name)) return "test_business_name";
  return null;
}

let cache: { at: number; ids: Map<string, string> } | null = null;

/** businessId -> reason, for every internal business. Cached briefly; the set is small. */
export async function getInternalBusinesses(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.ids;
  const out = new Map<string, string>();
  const db = getDb();
  if (!db) return out;
  const selfId = process.env.GRAVYBLOCK_SELF_BUSINESS_ID?.trim();
  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      accountType: businesses.accountType,
      billingEmail: businesses.billingEmail,
      accountEmail: businesses.accountEmail,
      websiteNormalized: businesses.websiteNormalized,
    })
    .from(businesses)
    .where(
      or(
        eq(businesses.accountType, "house"),
        selfId ? eq(businesses.id, selfId) : sql`false`,
        sql`lower(${businesses.billingEmail}) ~ '@(gravyblock\\.com|iscreamstudio\\.com|example\\.(com|org|net)|test\\.com)$'`,
        sql`lower(${businesses.accountEmail}) ~ '@(gravyblock\\.com|iscreamstudio\\.com|example\\.(com|org|net)|test\\.com)$'`,
        sql`lower(${businesses.billingEmail}) ~ '(funnel-test|conversion-test|journey-test|\\+test)'`,
        sql`${businesses.websiteNormalized} in ('example.com','example.org','example.net','test.com')`,
        sql`${businesses.name} ~* '(test (control )?co\\y|\\yqa\\y|test business)'`,
      ),
    );
  for (const r of rows) {
    const reason = internalReason(r);
    if (reason) out.set(r.id, reason);
  }
  // Explicit markers recorded earlier or set by an admin also count.
  const markers = await db.select({ businessId: jobs.businessId }).from(jobs).where(eq(jobs.type, "internal_account"));
  for (const m of markers) if (m.businessId && !out.has(m.businessId)) out.set(m.businessId, "marked_internal");
  cache = { at: Date.now(), ids: out };
  return out;
}

/** Records an auditable marker for each internal business that does not have one yet. Idempotent. */
export async function markInternalBusinesses(): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  const internal = await getInternalBusinesses();
  if (!internal.size) return 0;
  const ids = [...internal.keys()];
  const existing = await db.select({ businessId: jobs.businessId }).from(jobs).where(and(eq(jobs.type, "internal_account"), inArray(jobs.businessId, ids)));
  const have = new Set(existing.map((e) => e.businessId));
  let added = 0;
  for (const [id, reason] of internal) {
    if (have.has(id)) continue;
    await db.insert(jobs).values({ businessId: id, type: "internal_account", status: "completed", payload: { reason } });
    added++;
  }
  cache = null;
  return added;
}

export const SCAN_ORIGINS = {
  public: "public_scan",
  outreach: "outreach_prescan",
  internal: "internal_scan",
  system: "system_scan",
  unknown: "free_scan", // legacy value: not classified, reported as UNKNOWN
} as const;
export type ScanOriginValue = (typeof SCAN_ORIGINS)[keyof typeof SCAN_ORIGINS];

/**
 * Classifies historical scans that still carry the legacy `free_scan` value, using only reliable evidence:
 *  - internal business -> internal_scan
 *  - business that received a real cold-outreach send -> outreach_prescan
 *  - a scan_completed funnel event for the scan's report: with a browser session -> public_scan, without -> system_scan
 *  - after first-party tracking began, a scan with no scan_completed event at all was not created by the public form -> system_scan
 * Anything else stays `free_scan` and is reported as UNKNOWN. Safe to run repeatedly.
 */
export async function backfillScanClassification(): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const internal = [...(await getInternalBusinesses()).keys()];
  const result: Record<string, number> = {};
  const run = async (label: string, q: ReturnType<typeof sql>) => {
    const r = (await db.execute(q)) as unknown as { count?: number; length?: number };
    result[label] = Number(r.count ?? r.length ?? 0);
  };
  if (internal.length) {
    await run(
      "internal",
      sql`update scans set source = ${SCAN_ORIGINS.internal} where source = ${SCAN_ORIGINS.unknown} and business_id in (${sql.join(internal.map((id) => sql`${id}::uuid`), sql`, `)})`,
    );
  }
  await run(
    "outreach",
    sql`update scans set source = ${SCAN_ORIGINS.outreach} where source = ${SCAN_ORIGINS.unknown} and business_id in (select business_id from outreach_sends where business_id is not null and is_test = 'false')`,
  );
  await run(
    "public",
    sql`update scans s set source = ${SCAN_ORIGINS.public} from reports r where r.scan_id = s.id and s.source = ${SCAN_ORIGINS.unknown} and exists (select 1 from funnel_events e where e.event_type = 'scan_completed' and e.report_public_id = r.public_id and e.session_id is not null)`,
  );
  await run(
    "system_with_event",
    sql`update scans s set source = ${SCAN_ORIGINS.system} from reports r where r.scan_id = s.id and s.source = ${SCAN_ORIGINS.unknown} and exists (select 1 from funnel_events e where e.event_type = 'scan_completed' and e.report_public_id = r.public_id and e.session_id is null)`,
  );
  await run(
    "system_untracked",
    sql`update scans s set source = ${SCAN_ORIGINS.system} where s.source = ${SCAN_ORIGINS.unknown} and s.created_at >= (select min(created_at) + interval '1 day' from funnel_events where event_type = 'scan_completed') and not exists (select 1 from reports r join funnel_events e on e.report_public_id = r.public_id and e.event_type = 'scan_completed' where r.scan_id = s.id)`,
  );
  return result;
}
