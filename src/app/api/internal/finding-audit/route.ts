import { timingSafeEqual, createHmac } from "node:crypto";
import { getSqlClient } from "@/lib/db";

/** TEMPORARY, secret-gated, read-only. Audits top findings across the 45 clean initial sends. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "finding-audit").update(provided).digest();
  const b = createHmac("sha256", "finding-audit").update(expected).digest();
  return timingSafeEqual(a, b);
}

const ATTRIBUTION_START = "2026-09-04T00:00:00Z";

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const sql = getSqlClient();
  if (!sql) return Response.json({ error: "no_db" }, { status: 500 });

  const sentJobs = await sql.unsafe(
    `select id, created_at, payload from jobs where type = 'cold_outreach_sent' and created_at >= $1 order by created_at asc`,
    [ATTRIBUTION_START],
  );

  const rows = sentJobs as unknown as Array<{ id: string; created_at: string; payload: Record<string, unknown> }>;
  const publicIds = rows.map((r) => r.payload.reportPublicId as string).filter(Boolean);

  const reportRows = publicIds.length
    ? await sql.unsafe(
        `select public_id, overall_score, payload from reports where public_id = any($1)`,
        [publicIds],
      )
    : [];
  const reportByPublicId = new Map(
    (reportRows as unknown as Array<{ public_id: string; overall_score: number; payload: Record<string, unknown> }>).map((r) => [
      r.public_id,
      r,
    ]),
  );

  const merged = rows.map((r) => {
    const publicId = r.payload.reportPublicId as string | undefined;
    const report = publicId ? reportByPublicId.get(publicId) : null;
    const fixes = (report?.payload as { prioritizedFixes?: Array<{ id?: string; title?: string; impact?: string }> } | undefined)
      ?.prioritizedFixes;
    return {
      businessName: r.payload.businessName,
      city: r.payload.city,
      industry: r.payload.industry,
      isNamed: r.payload.isNamed,
      contactSource: r.payload.contactSource,
      reportPublicId: publicId,
      score: report?.overall_score ?? null,
      topFindingId: fixes?.[0]?.id ?? null,
      topFindingTitle: fixes?.[0]?.title ?? null,
      topFindingImpact: fixes?.[0]?.impact ?? null,
      allFindingIds: (fixes ?? []).map((f) => f.id),
    };
  });

  return Response.json({ count: merged.length, prospects: merged });
}
