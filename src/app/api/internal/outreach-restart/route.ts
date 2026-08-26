import { timingSafeEqual, createHmac } from "node:crypto";
import { getDb, jobs } from "@/lib/db";
import { getOutreachSettings } from "@/app/admin/(dashboard)/outreach/actions";
import { recordOutreachRestart } from "@/lib/outreach/send-budget";

/**
 * TEMPORARY, secret-gated, one-time action: flips outreach_settings.paused
 * to false (preserving every other current setting) and records the
 * cold_outreach_restart marker the ramp schedule (send-budget.ts) anchors
 * to. Explicit, deliberate operator action per the user's own instruction —
 * not something to leave callable. Remove immediately after use.
 */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "outreach-restart").update(provided).digest();
  const b = createHmac("sha256", "outreach-restart").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const db = getDb();
  if (!db) return Response.json({ error: "no_db" }, { status: 500 });

  const current = await getOutreachSettings();
  if (!current.paused) {
    return Response.json({ ok: true, alreadyActive: true, settings: current });
  }

  await db.insert(jobs).values({
    type: "outreach_settings",
    status: "completed",
    payload: { ...current, paused: false },
  });
  await recordOutreachRestart();

  return Response.json({ ok: true, previousSettings: current, newSettings: { ...current, paused: false } });
}
