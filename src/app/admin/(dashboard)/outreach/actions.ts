"use server";

import { desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, jobs } from "@/lib/db";
import { isAdminSession } from "@/lib/auth/admin-session";

export type OutreachSettings = {
  emailsPerBatch: number;   // 1–40 (4 weekday windows → up to 160/day)
  paused: boolean;
  weekdayEnabled: boolean;
  weekendRestaurantsEnabled: boolean;
};

// 25/batch × 4 weekday windows = ~100/day — owner-requested max while cold
// email still sends from the primary domain. The worker's bounce circuit
// breaker auto-pauses the channel if bounces exceed 8% of sends over 48h.
const DEFAULTS: OutreachSettings = {
  emailsPerBatch: 25,
  paused: false,
  weekdayEnabled: true,
  weekendRestaurantsEnabled: true,
};

/**
 * Settings rows saved before the July 13, 2026 volume ramp were capped at 10
 * emails/batch by the old UI limit. The owner ordered max volume, so legacy
 * rows no longer bind the batch size — but pause/enable flags are always
 * honored, and any row saved after this date controls batch size exactly
 * (the admin can still turn volume DOWN going forward).
 */
const VOLUME_RAMP_CUTOFF = new Date("2026-07-13T00:00:00Z");

/** Read current settings from DB (latest outreach_settings job), falling back to defaults. */
export async function getOutreachSettings(): Promise<OutreachSettings> {
  const db = getDb();
  if (!db) return DEFAULTS;
  const [row] = await db
    .select({ payload: jobs.payload, createdAt: jobs.createdAt })
    .from(jobs)
    .where(eq(jobs.type, "outreach_settings"))
    .orderBy(desc(jobs.createdAt))
    .limit(1);
  if (!row?.payload) return DEFAULTS;
  const p = row.payload as Partial<OutreachSettings>;
  const legacyRow = row.createdAt < VOLUME_RAMP_CUTOFF;
  return {
    emailsPerBatch: legacyRow ? DEFAULTS.emailsPerBatch : (p.emailsPerBatch ?? DEFAULTS.emailsPerBatch),
    paused: p.paused ?? DEFAULTS.paused,
    weekdayEnabled: p.weekdayEnabled ?? DEFAULTS.weekdayEnabled,
    weekendRestaurantsEnabled: p.weekendRestaurantsEnabled ?? DEFAULTS.weekendRestaurantsEnabled,
  };
}

/** Persist new settings as a new jobs row (append-only, latest wins). */
export async function saveOutreachSettings(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Unauthorized" };
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };

  const emailsPerBatch = Math.min(40, Math.max(1, parseInt(String(formData.get("emailsPerBatch") ?? "25"), 10)));
  const paused = formData.get("paused") === "true";
  const weekdayEnabled = formData.get("weekdayEnabled") !== "false";
  const weekendRestaurantsEnabled = formData.get("weekendRestaurantsEnabled") !== "false";

  await db.insert(jobs).values({
    type: "outreach_settings",
    status: "completed",
    payload: { emailsPerBatch, paused, weekdayEnabled, weekendRestaurantsEnabled },
  });

  revalidatePath("/admin/outreach");
  return { ok: true };
}

/** All individual emails sent (cold_outreach_sent jobs). */
export async function getSentEmails(limit = 200) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: jobs.id, createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, "cold_outreach_sent"))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const p = r.payload as Record<string, string> | null;
    return {
      id: r.id,
      sentAt: r.createdAt,
      businessName: p?.businessName ?? "—",
      email: p?.email ?? "—",
      city: p?.city ?? "—",
      industry: p?.industry ?? "—",
      placeId: p?.placeId ?? "",
    };
  });
}

/** Batch-level summary rows (cold_outreach_batch jobs). */
export async function getBatchHistory(limit = 30) {
  const db = getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: jobs.id, createdAt: jobs.createdAt, payload: jobs.payload })
    .from(jobs)
    .where(eq(jobs.type, "cold_outreach_batch"))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const p = r.payload as Record<string, unknown> | null;
    return {
      id: r.id,
      ranAt: r.createdAt,
      city: String(p?.city ?? "—"),
      state: String(p?.state ?? ""),
      industry: String(p?.industryLabel ?? p?.industry ?? "—"),
      window: String(p?.window ?? "single"),
      sent: Number(p?.sent ?? 0),
      skipped: Number(p?.skipped ?? 0),
      prospects: Number(p?.prospects ?? 0),
    };
  });
}

/** Rough count of emails sent this month and all-time. */
export async function getOutreachCounts() {
  const db = getDb();
  if (!db) return { allTime: 0, thisMonth: 0, thisWeek: 0 };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

  const [allRows, monthRows, weekRows] = await Promise.all([
    db.select({ id: jobs.id }).from(jobs).where(eq(jobs.type, "cold_outreach_sent")),
    db.select({ id: jobs.id }).from(jobs).where(
      sql`type = 'cold_outreach_sent' AND created_at >= ${monthStart.toISOString()}`
    ),
    db.select({ id: jobs.id }).from(jobs).where(
      sql`type = 'cold_outreach_sent' AND created_at >= ${weekStart.toISOString()}`
    ),
  ]);

  return { allTime: allRows.length, thisMonth: monthRows.length, thisWeek: weekRows.length };
}
