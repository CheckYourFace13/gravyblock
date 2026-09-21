/**
 * Proof Ledger API. Every engine calls recordProof() ONLY after verifying the
 * result at the external destination. Idempotent via dedupeKey.
 *
 * Public display rule: a ledger row may be shown publicly only when its
 * business is a GravyBlock house account or has opted into showcase
 * (businesses.showcaseOptIn = "true"). Customer data is never shown otherwise;
 * personalized reports and outreach only ever use anonymized, aggregate
 * statements drawn from rows whose business permits public display.
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { businesses, getDb, proofLedger } from "@/lib/db";

export type ProofCategory = "content" | "ranking" | "backlink" | "gbp" | "technical" | "citation" | "review" | "aeo" | "social";

export type ProofInput = {
  businessId: string;
  actionType: string;
  engine: string;
  proofCategory: ProofCategory;
  destination?: string | null;
  summary: string;
  beforeEvidence?: unknown;
  afterEvidence?: unknown;
  verifiedAt?: Date;
  metricName?: string | null;
  metricBefore?: number | null;
  metricAfter?: number | null;
  methodVersion?: string;
  findingType?: string | null;
  /** Stable identity of the verified event, e.g. "content_published:<publishedContentId>". */
  dedupeKey: string;
};

export async function recordProof(input: ProofInput): Promise<{ recorded: boolean }> {
  const db = getDb();
  if (!db) return { recorded: false };
  try {
    const [biz] = await db.select({ vertical: businesses.vertical, primaryCategory: businesses.primaryCategory }).from(businesses).where(eq(businesses.id, input.businessId)).limit(1);
    const industry = biz?.vertical && biz.vertical.toLowerCase() !== "other" ? biz.vertical : biz?.primaryCategory ?? null;
    const rows = await db
      .insert(proofLedger)
      .values({
        businessId: input.businessId,
        actionType: input.actionType,
        engine: input.engine,
        proofCategory: input.proofCategory,
        destination: input.destination ?? null,
        summary: input.summary.slice(0, 500),
        beforeEvidence: input.beforeEvidence ?? null,
        afterEvidence: input.afterEvidence ?? null,
        verifiedAt: input.verifiedAt ?? new Date(),
        metricName: input.metricName ?? null,
        metricBefore: input.metricBefore ?? null,
        metricAfter: input.metricAfter ?? null,
        methodVersion: input.methodVersion ?? "v1",
        industry,
        findingType: input.findingType ?? null,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing({ target: proofLedger.dedupeKey })
      .returning({ id: proofLedger.id });
    return { recorded: rows.length > 0 };
  } catch (err) {
    console.error("[proof-ledger] record failed", { dedupeKey: input.dedupeKey, error: err instanceof Error ? err.message : String(err) });
    return { recorded: false };
  }
}

export type PublicProofRow = typeof proofLedger.$inferSelect & { businessName: string };

/** Ledger rows whose business permits public display (house account or showcase opt-in). */
export async function getPublicProof(opts: { limit?: number; categories?: ProofCategory[]; businessId?: string } = {}): Promise<PublicProofRow[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ row: proofLedger, name: businesses.name, accountType: businesses.accountType, showcase: businesses.showcaseOptIn })
    .from(proofLedger)
    .innerJoin(businesses, eq(businesses.id, proofLedger.businessId))
    .where(
      and(
        opts.businessId ? eq(proofLedger.businessId, opts.businessId) : sql`true`,
        opts.categories?.length ? inArray(proofLedger.proofCategory, opts.categories) : sql`true`,
      ),
    )
    .orderBy(desc(proofLedger.verifiedAt))
    .limit((opts.limit ?? 50) * 3);
  return rows
    .filter((r) => (r.accountType === "house" || r.showcase === "true") && !r.name.toLowerCase().includes("iscream"))
    .slice(0, opts.limit ?? 50)
    .map((r) => ({ ...r.row, businessName: r.name }));
}

/** Proof categories most relevant to a report finding id (sales matching). */
export function proofCategoriesForFinding(findingId: string | null | undefined): ProofCategory[] {
  const id = findingId ?? "";
  if (/crawl-(schema|meta|title|h1|noindex|mobile|tel|cta|hours|location|og|description|no-structured|social)/.test(id)) return ["technical", "content"];
  if (/place-review|rating/.test(id)) return ["review", "gbp"];
  if (/social/.test(id)) return ["social"];
  if (/canonical-estimated|lr-cross|gsc-position/.test(id)) return ["ranking", "gbp", "content", "backlink"];
  if (/gp-types|place-rating/.test(id)) return ["gbp"];
  return ["content", "gbp"];
}

/**
 * One truthful, anonymized proof sentence for a prospect's finding — or null.
 * Uses only publicly-permitted ledger rows and states only what the row proves
 * (a measured change is quoted only when metricBefore/metricAfter exist).
 */
export async function relevantProofStatement(findingId: string | null | undefined): Promise<{ text: string; category: ProofCategory; ledgerId: string } | null> {
  const cats = proofCategoriesForFinding(findingId);
  const rows = await getPublicProof({ limit: 20, categories: cats });
  const row = rows.find((r) => r.metricBefore != null && r.metricAfter != null) ?? rows[0];
  if (!row) return null;
  const measured = row.metricBefore != null && row.metricAfter != null && row.metricName ? ` ${row.metricName} went from ${row.metricBefore} to ${row.metricAfter} (${row.methodVersion}).` : "";
  return { text: `On another local business GravyBlock ${row.summary.replace(/^GravyBlock\s+/i, "").replace(/^./, (c) => c.toLowerCase())}, verified on ${row.verifiedAt.toISOString().slice(0, 10)}.${measured}`, category: row.proofCategory as ProofCategory, ledgerId: row.id };
}

export async function proofCountsByCategory(businessId?: string): Promise<Record<string, number>> {
  const db = getDb();
  if (!db) return {};
  const rows = await db
    .select({ c: proofLedger.proofCategory, n: sql<number>`count(*)::int` })
    .from(proofLedger)
    .where(businessId ? eq(proofLedger.businessId, businessId) : sql`true`)
    .groupBy(proofLedger.proofCategory);
  return Object.fromEntries(rows.map((r) => [r.c, r.n]));
}
