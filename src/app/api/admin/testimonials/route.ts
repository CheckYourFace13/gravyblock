/**
 * Personal admin tool for approving testimonials. Token-gated (STATS_TOKEN).
 *
 *   List pending:  GET /api/admin/testimonials?token=XXX
 *   Approve one:   GET /api/admin/testimonials?token=XXX&approve=<id>
 *   Hide one:      GET /api/admin/testimonials?token=XXX&hide=<id>
 *
 * (GET-based actions are fine here — single-operator tool, click-a-link UX.)
 */

import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, testimonials } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const params = req.nextUrl.searchParams;
  if (!process.env.STATS_TOKEN || params.get("token") !== process.env.STATS_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ error: "No database" }, { status: 503 });

  const approveId = params.get("approve");
  const hideId = params.get("hide");

  try {
    if (approveId) {
      await db.update(testimonials).set({ status: "approved" }).where(eq(testimonials.id, approveId));
      return NextResponse.json({ ok: true, action: "approved", id: approveId });
    }
    if (hideId) {
      await db.update(testimonials).set({ status: "hidden" }).where(eq(testimonials.id, hideId));
      return NextResponse.json({ ok: true, action: "hidden", id: hideId });
    }

    // Default: list all, newest first, with approve/hide links for convenience.
    const rows = await db
      .select()
      .from(testimonials)
      .orderBy(desc(testimonials.createdAt))
      .limit(100);

    const token = params.get("token");
    const base = `${req.nextUrl.origin}/api/admin/testimonials?token=${token}`;
    return NextResponse.json({
      counts: {
        pending: rows.filter((r) => r.status === "pending").length,
        approved: rows.filter((r) => r.status === "approved").length,
        hidden: rows.filter((r) => r.status === "hidden").length,
      },
      testimonials: rows.map((r) => ({
        id: r.id,
        status: r.status,
        author: r.authorName,
        business: r.businessName,
        rating: r.rating,
        quote: r.quote,
        approveLink: `${base}&approve=${r.id}`,
        hideLink: `${base}&hide=${r.id}`,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: "Query failed", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
