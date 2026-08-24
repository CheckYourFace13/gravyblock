/**
 * Re-engages leads whose 14-day drip sequence (lead-drip.ts) already ended
 * without converting. Without this, a lead who doesn't convert in their
 * first 14 days gets zero further contact, forever — confirmed via
 * /admin/leads: every existing lead (oldest from April, none newer than
 * mid-June) sat at pipelineStatus "new" with no automation touching them
 * again. These are warmer than any cold-outreach prospect (they already ran
 * a scan and handed over their email), so periodically checking back in is
 * worth it even at low volume.
 *
 * Worker calls runLeadReengagementBatch() every tick; deduped + capped via
 * the jobs table so a lead gets at most MAX_REENGAGEMENTS emails total,
 * spaced REENGAGE_INTERVAL_DAYS apart.
 */

import { and, eq, ne, sql, desc, inArray, lt } from "drizzle-orm";
import { getDb, leads, businesses, jobs } from "@/lib/db";
import { isOptedOut, unsubscribeFooter } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";

const DRIP_DAYS = 14; // must match lead-drip.ts — leads younger than this are still mid-sequence
const REENGAGE_INTERVAL_DAYS = 30;
const MAX_REENGAGEMENTS = 2;
const REENGAGEMENT_JOB_TYPE = "lead_reengagement_sent";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function btn(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:100px;text-decoration:none">${label}</a>`;
}

function wrap(content: string, email: string, leadId: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
${content}
${unsubscribeFooter(email, leadId)}
</div></body></html>`;
}

function buildEmail(attempt: number, ctx: { name: string; businessName: string; reportUrl: string; email: string; leadId: string }) {
  const { name, businessName, reportUrl, email, leadId } = ctx;

  if (attempt === 1) {
    return {
      subject: `We dropped our price — ${businessName} update`,
      html: wrap(`
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Pricing Update</p>
        <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Hi ${name} — worth a second look</h1>
        <p style="color:#52525b;font-size:15px;margin:16px 0">
          A while back you ran a free visibility scan for <strong>${businessName}</strong>. Since then we dropped Starter to <strong>$29.99/mo</strong> with code INTRO50 — the lowest starting price of any local SEO automation tool we've compared against.
        </p>
        <p style="color:#52525b;font-size:14px;margin:12px 0">
          It still runs the same way: visibility monitoring, a monthly fix list, citation checklist, and AI search checks — no manual work on your end.
        </p>
        ${btn(reportUrl, "See your report again →")}
        <p style="color:#71717a;font-size:13px;margin:20px 0 0">If it's not a fit, no worries — reply "no thanks" and you won't hear from me again.</p>
      `, email, leadId),
    };
  }

  return {
    subject: `Closing the loop on ${businessName}`,
    html: wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Last Check-In</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Hi ${name}</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">
        I've reached out about <strong>${businessName}</strong>'s visibility scan a couple of times now — this is the last one, I'll close it out after this.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Starter is $29.99/mo if you ever want it handled automatically. Your original report is still here:
      </p>
      ${btn(reportUrl, "View report →")}
      <p style="color:#71717a;font-size:13px;margin:20px 0 0">No hard feelings either way — I hope business is going well.</p>
    `, email, leadId),
  };
}

async function getReengagementHistory(leadId: string): Promise<{ count: number; lastSentAt: Date | null }> {
  const db = getDb();
  if (!db) return { count: 0, lastSentAt: null };
  const rows = await db
    .select({ createdAt: jobs.createdAt })
    .from(jobs)
    .where(and(eq(jobs.type, REENGAGEMENT_JOB_TYPE), eq(sql`payload->>'leadId'`, leadId)))
    .orderBy(desc(jobs.createdAt));
  return { count: rows.length, lastSentAt: rows[0]?.createdAt ?? null };
}

async function recordReengagementSent(leadId: string, attempt: number) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: REENGAGEMENT_JOB_TYPE,
    status: "completed",
    payload: { leadId, attempt },
  });
}

async function sendReengagementEmail(email: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;

  // Authoritative pause check, right at the send boundary — these are
  // unconverted prospects, the same acquisition-send category the admin
  // pause switch is meant to cover. See pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(email);
  if (!pauseCheck.allowed) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [email], subject, html }),
  });
  return res.ok;
}

export async function runLeadReengagementBatch(batchSize = 20): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const dripCutoff = new Date(Date.now() - DRIP_DAYS * 24 * 60 * 60 * 1000);

  // Leads whose initial 14-day drip window has already ended, not converted/unsubscribed.
  const candidates = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      businessId: leads.businessId,
      businessName: businesses.name,
      reportPublicId: leads.reportPublicId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(businesses, eq(leads.businessId, businesses.id))
    .where(
      and(
        lt(leads.createdAt, dripCutoff),
        ne(leads.pipelineStatus, "converted"),
        ne(leads.pipelineStatus, "unsubscribed"),
        ne(leads.email, ""),
      ),
    )
    .limit(200);

  const paidTiers = ["starter", "growth", "pro", "agency"];
  const paidBusinesses = await db
    .select({ billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(inArray(businesses.planTier, paidTiers));
  const convertedEmails = new Set(
    paidBusinesses.map((b) => b.billingEmail?.toLowerCase()).filter((e): e is string => Boolean(e)),
  );

  let sent = 0;
  let skipped = 0;

  for (const lead of candidates.slice(0, batchSize)) {
    if (convertedEmails.has(lead.email.toLowerCase()) || (await isOptedOut(lead.email))) {
      skipped++;
      continue;
    }

    const { count, lastSentAt } = await getReengagementHistory(lead.id);
    if (count >= MAX_REENGAGEMENTS) {
      skipped++;
      continue;
    }
    if (lastSentAt && Date.now() - lastSentAt.getTime() < REENGAGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000) {
      skipped++;
      continue;
    }

    const attempt = count + 1;
    const reportUrl = lead.reportPublicId ? `${siteUrl}/report/${lead.reportPublicId}` : `${siteUrl}/scan`;
    const { subject, html } = buildEmail(attempt, {
      name: lead.name.split(" ")[0] || lead.name,
      businessName: lead.businessName || lead.name,
      reportUrl,
      email: lead.email,
      leadId: lead.id,
    });

    const ok = await sendReengagementEmail(lead.email, subject, html);
    if (ok) {
      await recordReengagementSent(lead.id, attempt);
      sent++;
    } else {
      skipped++;
    }
  }

  return { sent, skipped };
}
