import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, reviewRequestLinks, reviewRequestResponses, businesses } from "@/lib/db";

type Params = { params: Promise<{ token: string }> };

/** GET /api/review-request/[token] — load link metadata for the public page */
export async function GET(_req: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const [link] = await db
    .select({
      id: reviewRequestLinks.id,
      businessId: reviewRequestLinks.businessId,
      positiveRedirectUrl: reviewRequestLinks.positiveRedirectUrl,
      threshold: reviewRequestLinks.threshold,
      active: reviewRequestLinks.active,
    })
    .from(reviewRequestLinks)
    .where(eq(reviewRequestLinks.token, token))
    .limit(1);

  if (!link || link.active !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [biz] = await db
    .select({ name: businesses.name })
    .from(businesses)
    .where(eq(businesses.id, link.businessId))
    .limit(1);

  return NextResponse.json({
    businessName: biz?.name ?? null,
    positiveRedirectUrl: link.positiveRedirectUrl,
    threshold: link.threshold,
  });
}

/** POST /api/review-request/[token] — submit a rating + optional feedback */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let body: { rating?: unknown; feedback?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const rating = typeof body.rating === "number" ? body.rating : null;
  if (!rating || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "invalid_rating" }, { status: 400 });
  }

  const [link] = await db
    .select({ id: reviewRequestLinks.id, businessId: reviewRequestLinks.businessId, active: reviewRequestLinks.active })
    .from(reviewRequestLinks)
    .where(eq(reviewRequestLinks.token, token))
    .limit(1);

  if (!link || link.active !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await db.insert(reviewRequestResponses).values({
    linkId: link.id,
    businessId: link.businessId,
    rating,
    feedback: typeof body.feedback === "string" ? body.feedback.slice(0, 2000) : null,
  });

  return NextResponse.json({ ok: true });
}
