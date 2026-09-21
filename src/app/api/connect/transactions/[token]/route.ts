import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, businessConfigs, reviewRequests } from "@/lib/db";
import { isOptedOut } from "@/lib/email/optout";

/**
 * POST /api/connect/transactions/[token]
 * The customer's own system (Zapier / webhook / POS) posts COMPLETED customers.
 * Body: one object or an array (max 50) of
 *   { externalId: string, email: string, name?: string, completedAt?: ISO string }
 * Responses never echo customer emails.
 */

type Params = { params: Promise<{ token: string }> };

const MAX_BATCH = 50;
const MAX_ROWS_PER_DAY = 500;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const db = getDb();
  if (!db) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  if (!token || token.length < 32 || token.length > 128) return unauthorized();

  const [cfg] = await db
    .select({ businessId: businessConfigs.businessId, token: businessConfigs.transactionsToken })
    .from(businessConfigs)
    .where(eq(businessConfigs.transactionsToken, token))
    .limit(1);

  if (!cfg || !cfg.token || !safeEqual(cfg.token, token)) return unauthorized();
  const businessId = cfg.businessId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > MAX_BATCH) {
    return NextResponse.json({ error: "bad_request", detail: `send 1 to ${MAX_BATCH} items` }, { status: 400 });
  }

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [usage] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .where(and(eq(reviewRequests.businessId, businessId), gte(reviewRequests.createdAt, dayStart)));
  let remaining = MAX_ROWS_PER_DAY - Number(usage?.n ?? 0);

  const counts = { received: items.length, created: 0, duplicate: 0, suppressed: 0, invalid: 0, rate_limited: 0 };
  const seen = new Set<string>();
  const now = Date.now();

  for (const raw of items) {
    const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const externalId = typeof item.externalId === "string" ? item.externalId.trim() : "";
    const email = typeof item.email === "string" ? item.email.trim().toLowerCase() : "";
    const name = typeof item.name === "string" ? item.name.trim().slice(0, 120) || null : null;

    let completedAt = new Date(now);
    if (item.completedAt !== undefined && item.completedAt !== null) {
      const d = typeof item.completedAt === "string" ? new Date(item.completedAt) : null;
      // Reject unparseable dates and dates more than a day in the future.
      if (!d || Number.isNaN(d.getTime()) || d.getTime() > now + 24 * 60 * 60 * 1000) {
        counts.invalid++;
        continue;
      }
      completedAt = d;
    }

    if (!externalId || externalId.length > 200 || !email || email.length > 254 || !EMAIL_RE.test(email)) {
      counts.invalid++;
      continue;
    }

    if (seen.has(externalId)) { counts.duplicate++; continue; }
    seen.add(externalId);

    const [existing] = await db
      .select({ id: reviewRequests.id })
      .from(reviewRequests)
      .where(and(eq(reviewRequests.businessId, businessId), eq(reviewRequests.externalId, externalId)))
      .limit(1);
    if (existing) { counts.duplicate++; continue; }

    if (remaining <= 0) { counts.rate_limited++; continue; }

    const suppressed = await isOptedOut(email);
    await db.insert(reviewRequests).values({
      businessId,
      externalId,
      customerEmail: email,
      customerName: name,
      completedAt,
      status: suppressed ? "suppressed" : "pending",
      stoppedReason: suppressed ? "opted_out" : null,
    });
    remaining--;
    if (suppressed) counts.suppressed++;
    else counts.created++;
  }

  return NextResponse.json({ ok: true, ...counts });
}
