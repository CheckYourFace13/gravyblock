"use server";

import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, jobs, emailEvents, funnelEvents, leads } from "@/lib/db";
import { isAdminSession } from "@/lib/auth/admin-session";
import { listResendWebhooks } from "@/lib/integrations/resend-webhooks";

const EXPECTED_WEBHOOK_ENDPOINT = "https://gravyblock.com/api/resend/webhook";
const EXPECTED_WEBHOOK_EVENTS = ["email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained"];

const COLD_OUTREACH_EMAIL_TYPES = ["cold_outreach", "cold_outreach_followup", "cold_outreach_breakup"] as const;

export type FunnelPeriodStats = {
  prospectsEvaluated: number;
  skipped: number;
  emailsAttempted: number;
  delivered: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  opened: number;
  clicked: number;
  attributedScanStarts: number;
  attributedLeads: number;
};

const EMPTY_PERIOD: FunnelPeriodStats = {
  prospectsEvaluated: 0,
  skipped: 0,
  emailsAttempted: 0,
  delivered: 0,
  bounced: 0,
  complained: 0,
  unsubscribed: 0,
  opened: 0,
  clicked: 0,
  attributedScanStarts: 0,
  attributedLeads: 0,
};

async function periodStats(since: Date | null): Promise<FunnelPeriodStats> {
  const db = getDb();
  if (!db) return EMPTY_PERIOD;

  const batchWhere = since
    ? and(eq(jobs.type, "cold_outreach_batch"), gte(jobs.createdAt, since))
    : eq(jobs.type, "cold_outreach_batch");
  const sentWhere = since
    ? and(eq(jobs.type, "cold_outreach_sent"), gte(jobs.createdAt, since))
    : eq(jobs.type, "cold_outreach_sent");
  const optOutWhere = since
    ? and(eq(jobs.type, "email_optout"), gte(jobs.createdAt, since))
    : eq(jobs.type, "email_optout");
  const emailEventsWhere = since
    ? and(inArray(emailEvents.emailType, [...COLD_OUTREACH_EMAIL_TYPES]), gte(emailEvents.createdAt, since))
    : inArray(emailEvents.emailType, [...COLD_OUTREACH_EMAIL_TYPES]);
  const attributedWhere = since
    ? and(eq(funnelEvents.utmSource, "cold_outreach"), gte(funnelEvents.createdAt, since))
    : eq(funnelEvents.utmSource, "cold_outreach");

  const [batchRows, sentRows, optOutRows, eventRows, attributedRows] = await Promise.all([
    db.select({ payload: jobs.payload }).from(jobs).where(batchWhere),
    db.select({ id: jobs.id }).from(jobs).where(sentWhere),
    db.select({ id: jobs.id }).from(jobs).where(optOutWhere),
    db
      .select({ eventType: emailEvents.eventType, n: sql<number>`count(*)::int` })
      .from(emailEvents)
      .where(emailEventsWhere)
      .groupBy(emailEvents.eventType)
      .catch(() => [] as Array<{ eventType: string; n: number }>),
    db
      .select({ eventType: funnelEvents.eventType, n: sql<number>`count(*)::int` })
      .from(funnelEvents)
      .where(attributedWhere)
      .groupBy(funnelEvents.eventType)
      .catch(() => [] as Array<{ eventType: string; n: number }>),
  ]);

  let prospectsEvaluated = 0;
  let skipped = 0;
  for (const row of batchRows) {
    const p = row.payload as Record<string, unknown> | null;
    prospectsEvaluated += Number(p?.prospects ?? 0);
    skipped += Number(p?.skipped ?? 0);
  }

  const byType = new Map(eventRows.map((r) => [r.eventType, Number(r.n)]));
  const attributedByType = new Map(attributedRows.map((r) => [r.eventType, Number(r.n)]));

  return {
    prospectsEvaluated,
    skipped,
    emailsAttempted: sentRows.length,
    delivered: byType.get("delivered") ?? 0,
    bounced: byType.get("bounced") ?? 0,
    complained: byType.get("complained") ?? 0,
    unsubscribed: optOutRows.length,
    opened: byType.get("opened") ?? 0,
    clicked: byType.get("clicked") ?? 0,
    attributedScanStarts: attributedByType.get("scan_started") ?? 0,
    attributedLeads: attributedByType.get("lead_form_submitted") ?? 0,
  };
}

/**
 * Outreach funnel across four windows. Delivered/opened/clicked/bounced come
 * from the Resend webhook (emailEvents) — only populated from whenever that
 * webhook first started reliably receiving events, not retroactive.
 * attributedScanStarts/attributedLeads come from funnelEvents.utmSource =
 * 'cold_outreach', which only exists from this feature's ship date forward —
 * historical clicks before that date cannot be attributed and are not
 * estimated here.
 */
export async function getOutreachFunnel(): Promise<{
  today: FunnelPeriodStats;
  last7d: FunnelPeriodStats;
  last30d: FunnelPeriodStats;
  allTime: FunnelPeriodStats;
  emailEventsTrackingSince: string | null;
  attributionTrackingSince: string | null;
}> {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const start7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const start30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [today, last7d, last30d, allTime] = await Promise.all([
    periodStats(todayStart),
    periodStats(start7d),
    periodStats(start30d),
    periodStats(null),
  ]);

  let emailEventsTrackingSince: string | null = null;
  let attributionTrackingSince: string | null = null;
  if (db) {
    const [firstEmailEvent] = await db
      .select({ createdAt: emailEvents.createdAt })
      .from(emailEvents)
      .orderBy(emailEvents.createdAt)
      .limit(1)
      .catch(() => []);
    emailEventsTrackingSince = firstEmailEvent?.createdAt?.toISOString() ?? null;

    const [firstAttributed] = await db
      .select({ createdAt: funnelEvents.createdAt })
      .from(funnelEvents)
      .orderBy(funnelEvents.createdAt)
      .limit(1)
      .catch(() => []);
    attributionTrackingSince = firstAttributed?.createdAt?.toISOString() ?? null;
  }

  return { today, last7d, last30d, allTime, emailEventsTrackingSince, attributionTrackingSince };
}

/** Real leads (excludes the founder's own addresses/house-account inboxes) needing follow-up. */
export async function getLeadsNeedingFollowUp() {
  const db = getDb();
  if (!db) return [];

  const INTERNAL_DOMAINS = ["iscreamstudio.com", "gravyblock.com", "outbreakthreat.com", "example.com"];
  const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

  const rows = await db.select().from(leads).orderBy(desc(leads.lastSeenAt)).limit(500);

  const now = Date.now();
  return rows
    .filter((lead) => {
      const domain = lead.emailNormalized?.split("@")[1] ?? "";
      if (INTERNAL_DOMAINS.includes(domain)) return false;
      if (lead.pipelineStatus !== "new") return false;
      const age = now - new Date(lead.lastSeenAt ?? lead.createdAt).getTime();
      return age > STALE_AFTER_MS;
    })
    .map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      businessId: lead.businessId,
      source: lead.source,
      sources: Array.isArray(lead.sources) ? (lead.sources as string[]) : [lead.source],
      reportPublicId: lead.reportPublicId,
      firstSeenAt: lead.firstSeenAt.toISOString(),
      lastSeenAt: lead.lastSeenAt.toISOString(),
      daysWaiting: Math.floor((now - new Date(lead.lastSeenAt ?? lead.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}

/** Mark a lead as contacted/working/closed — the only write this page needs. */
export async function updateLeadPipelineStatus(
  _prev: { ok: boolean } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Unauthorized" };
  const db = getDb();
  if (!db) return { ok: false, error: "No database" };

  const leadId = String(formData.get("leadId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!leadId || !["new", "contacted", "working", "closed", "unsubscribed"].includes(status)) {
    return { ok: false, error: "Invalid input" };
  }

  await db.update(leads).set({ pipelineStatus: status }).where(eq(leads.id, leadId));
  revalidatePath("/admin/leads");
  revalidatePath("/admin/outreach");
  return { ok: true };
}

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

export type EmailHealth = {
  webhookConfigured: boolean | null; // null = couldn't check (no API key / API error)
  webhookCheckError: string | null;
  registeredEndpoint: string | null;
  registeredEvents: string[];
  registeredStatus: string | null;
  lastWebhookEventAt: string | null;
  lastDeliveredAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  lastBouncedAt: string | null;
  eventsLast24h: number;
  sentLast24h: number;
  sendsWithAnyEventPct: number | null;
  redAlert: string | null;
};

/** Checks Resend's own account config (not just our code) — see actions.ts header note on why this matters. */
export async function getEmailHealth(): Promise<EmailHealth> {
  const db = getDb();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const webhookCheck = await listResendWebhooks();
  const ours = webhookCheck.webhooks.find((w) => w.endpoint === EXPECTED_WEBHOOK_ENDPOINT);
  const missingEvents = ours ? EXPECTED_WEBHOOK_EVENTS.filter((e) => !ours.events.includes(e)) : EXPECTED_WEBHOOK_EVENTS;

  let lastWebhookEventAt: string | null = null;
  let lastDeliveredAt: string | null = null;
  let lastOpenedAt: string | null = null;
  let lastClickedAt: string | null = null;
  let lastBouncedAt: string | null = null;
  let eventsLast24h = 0;
  let sentLast24h = 0;
  let sendsWithAnyEventPct: number | null = null;

  if (db) {
    const lastEventPerType = async (eventType: string) => {
      const [row] = await db
        .select({ createdAt: emailEvents.createdAt })
        .from(emailEvents)
        .where(eq(emailEvents.eventType, eventType))
        .orderBy(desc(emailEvents.createdAt))
        .limit(1)
        .catch(() => []);
      return row?.createdAt?.toISOString() ?? null;
    };
    [lastDeliveredAt, lastOpenedAt, lastClickedAt, lastBouncedAt] = await Promise.all([
      lastEventPerType("delivered"),
      lastEventPerType("opened"),
      lastEventPerType("clicked"),
      lastEventPerType("bounced"),
    ]);

    const [lastAny] = await db
      .select({ createdAt: emailEvents.createdAt })
      .from(emailEvents)
      .orderBy(desc(emailEvents.createdAt))
      .limit(1)
      .catch(() => []);
    lastWebhookEventAt = lastAny?.createdAt?.toISOString() ?? null;

    const [eventsRows, sentRows] = await Promise.all([
      db.select({ id: emailEvents.id }).from(emailEvents).where(gte(emailEvents.createdAt, since24h)),
      db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.type, "cold_outreach_sent"), gte(jobs.createdAt, since24h))),
    ]);
    eventsLast24h = eventsRows.length;
    sentLast24h = sentRows.length;

    if (sentLast24h > 0) {
      // Rough correlation: recipients from the last 24h of sends vs recipients with any event ever.
      const [sentPayloads, recipientEvents] = await Promise.all([
        db.select({ payload: jobs.payload }).from(jobs).where(and(eq(jobs.type, "cold_outreach_sent"), gte(jobs.createdAt, since24h))),
        db.select({ recipient: emailEvents.recipient }).from(emailEvents).where(gte(emailEvents.createdAt, since24h)),
      ]);
      const recipientsWithEvent = new Set(recipientEvents.map((r) => r.recipient).filter(Boolean));
      const sentRecipients = sentPayloads
        .map((r) => (r.payload as Record<string, unknown> | null)?.email as string | undefined)
        .filter((e): e is string => Boolean(e));
      const withEvent = sentRecipients.filter((e) => recipientsWithEvent.has(e)).length;
      sendsWithAnyEventPct = sentRecipients.length ? Math.round((withEvent / sentRecipients.length) * 100) : null;
    }
  }

  let redAlert: string | null = null;
  if (sentLast24h > 0 && eventsLast24h === 0) {
    redAlert = `EMAIL TRACKING FAILURE — ${sentLast24h} emails sent in the last 24h but 0 Resend events received.`;
  }

  return {
    webhookConfigured: webhookCheck.ok ? Boolean(ours && missingEvents.length === 0) : null,
    webhookCheckError: webhookCheck.ok ? null : (webhookCheck.error ?? "unknown error"),
    registeredEndpoint: ours?.endpoint ?? null,
    registeredEvents: ours?.events ?? [],
    registeredStatus: ours?.status ?? null,
    lastWebhookEventAt,
    lastDeliveredAt,
    lastOpenedAt,
    lastClickedAt,
    lastBouncedAt,
    eventsLast24h,
    sentLast24h,
    sendsWithAnyEventPct,
    redAlert,
  };
}

/**
 * Sends ONE internal test email tagged distinctly (type=webhook_test), to an
 * address the admin controls — never a prospect. Used to prove the full
 * send -> webhook -> emailEvents lifecycle end to end instead of waiting
 * days for organic outreach events to arrive.
 */
export async function sendWebhookTestEmail(
  _prev: { ok: boolean; error?: string; resendEmailId?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; resendEmailId?: string }> {
  if (!(await isAdminSession())) return { ok: false, error: "Unauthorized" };
  const to = String(formData.get("to") ?? "").trim();
  if (!to || !to.includes("@")) return { ok: false, error: "Enter a valid email you control" };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { ok: false, error: "Resend not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "GravyBlock webhook test — internal, not a real send",
      html: `<p>This is a one-off internal test to verify Resend webhook delivery end to end.</p>
             <p>Click this link once to help generate a click event: <a href="https://gravyblock.com/?webhook_test=1">confirm test</a></p>`,
      tags: [{ name: "type", value: "webhook_test" }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend API ${res.status}: ${text}` };
  }
  const body = (await res.json()) as { id: string };

  const db = getDb();
  if (db) {
    await db.insert(jobs).values({
      type: "webhook_test_sent",
      status: "done",
      payload: { to, resendEmailId: body.id, sentAt: new Date().toISOString() },
    });
  }

  revalidatePath("/admin/outreach");
  return { ok: true, resendEmailId: body.id };
}

/** Lifecycle trace for a specific test send — used to prove send -> webhook -> DB end to end. */
export async function getWebhookTestTrace(resendEmailId: string) {
  const db = getDb();
  if (!db) return { events: [] as Array<{ eventType: string; createdAt: string }> };
  const rows = await db
    .select({ eventType: emailEvents.eventType, createdAt: emailEvents.createdAt })
    .from(emailEvents)
    .where(eq(emailEvents.emailId, resendEmailId))
    .orderBy(emailEvents.createdAt);
  return { events: rows.map((r) => ({ eventType: r.eventType, createdAt: r.createdAt.toISOString() })) };
}
