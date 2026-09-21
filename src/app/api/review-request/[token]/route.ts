import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, reviewRequestLinks, reviewRequestResponses, businesses } from "@/lib/db";

type Params = { params: Promise<{ token: string }> };

/**
 * Policy: every visitor gets the same experience. The Google review link is
 * always returned, and a private feedback box is always offered. Nothing here
 * routes or withholds anything based on a rating.
 */

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
      active: reviewRequestLinks.active,
    })
    .from(reviewRequestLinks)
    .where(eq(reviewRequestLinks.token, token))
    .limit(1);

  if (!link || link.active !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const [biz] = await db
    .select({ name: businesses.name, placeId: businesses.placeId })
    .from(businesses)
    .where(eq(businesses.id, link.businessId))
    .limit(1);

  const reviewUrl = biz?.placeId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(biz.placeId)}`
    : link.positiveRedirectUrl ?? null;

  return NextResponse.json({
    businessName: biz?.name ?? null,
    reviewUrl,
  });
}

/** POST /api/review-request/[token] — submit optional private feedback */
export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  let body: { feedback?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_request" }, { status: 400 }); }

  const feedback = typeof body.feedback === "string" ? body.feedback.trim().slice(0, 2000) : "";
  if (!feedback) return NextResponse.json({ error: "empty_feedback" }, { status: 400 });

  const [link] = await db
    .select({ id: reviewRequestLinks.id, businessId: reviewRequestLinks.businessId, active: reviewRequestLinks.active })
    .from(reviewRequestLinks)
    .where(eq(reviewRequestLinks.token, token))
    .limit(1);

  if (!link || link.active !== "true") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // rating column is NOT NULL and legacy; 0 = no rating collected.
  await db.insert(reviewRequestResponses).values({
    linkId: link.id,
    businessId: link.businessId,
    rating: 0,
    feedback,
  });

  return NextResponse.json({ ok: true });
}
