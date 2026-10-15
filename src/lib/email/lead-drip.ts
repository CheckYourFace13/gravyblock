import { and, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { getDb, leads, businesses, jobs, visibilitySnapshots } from "@/lib/db";
import { isOptedOut, unsubscribeFooter } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "@/lib/outreach/pause-guard";
import { createReportUnlockToken } from "@/lib/report/unlock-token";
import { getReportWithContext } from "@/lib/report/repository";

// After the report email sent on unlock, three follow-ups and then routine selling stops.
const DRIP_DAYS = 10;

type DripEmail = {
  day: number;
  subject: (ctx: DripContext) => string;
  html: (ctx: DripContext) => string;
};

type DripContext = {
  name: string;
  businessName: string;
  score: number | null;
  vertical: string | null;
  reportUrl: string;
  /** Opens the lead's own report with the Scale plan preselected, so a CTA never sends them to re-scan. */
  scaleUrl: string;
  /** The report's strongest finding, when the lead has a report. */
  topFinding: { title: string; detail: string } | null;
  scanUrl: string;
  email: string;
  leadId: string;
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function btn(href: string, label: string, style = "#dc2626") {
  return `<a href="${href}" style="display:inline-block;background:${style};color:#fff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:100px;text-decoration:none">${label}</a>`;
}

function wrap(content: string, email = "", leadId = "") {
  const footer = email
    ? unsubscribeFooter(email, leadId || undefined)
    : `<p style="margin:32px 0 0;font-size:12px;color:#a1a1aa;text-align:center">GravyBlock &middot; <a href="${siteUrl}/scan" style="color:#a1a1aa">Run another scan</a></p>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
${content}
${footer}
</div></body></html>`;
}

export const DRIP_SEQUENCE: DripEmail[] = [
  {
    day: 2,
    subject: ({ businessName, topFinding }) => (topFinding ? `${businessName}: ${topFinding.title}` : `What GravyBlock found for ${businessName}`),
    html: ({ name, businessName, email, leadId, scaleUrl, reportUrl, topFinding }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Your biggest finding</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">${topFinding ? topFinding.title : "Here is what stood out"}</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      ${topFinding ? `<p style="color:#52525b;font-size:14px;margin:12px 0">The most important thing we found for <strong>${businessName}</strong>: ${topFinding.detail}</p>` : `<p style="color:#52525b;font-size:14px;margin:12px 0">Your report for <strong>${businessName}</strong> lists what is holding back your visibility on Google.</p>`}
      <p style="color:#52525b;font-size:14px;margin:12px 0">You don't have to fix this yourself. GravyBlock already read your website and Google profile, so it knows what needs attention. It decides what is worth doing first, does the eligible work automatically, and checks that each change actually happened.</p>
      ${btn(scaleUrl, "Start GravyBlock — $39.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">$39.99/month · Cancel anytime · 30-day money-back guarantee</p>
      <p style="color:#71717a;font-size:12px;margin:12px 0"><a href="${reportUrl}" style="color:#dc2626">View my full report</a></p>
    `, email, leadId),
  },
  {
    day: 5,
    subject: () => "How GravyBlock is different from another SEO dashboard",
    html: ({ name, businessName, email, leadId, scaleUrl, reportUrl }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">How it's different</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">A dashboard shows you things. GravyBlock does them.</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">Many SEO tools give you a dashboard and leave the work to you or an agency. Some now automate parts of it, and they can suit you if you want to run things yourself.</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">GravyBlock is built for owners who don't want to operate a toolbox. It chooses the worthwhile work for ${businessName}, does what you've connected it to do, verifies the result, and reports only what it confirmed. After one-time connections (your website, your Google account) there is no task list for you to manage. It does not guarantee rankings.</p>
      ${btn(scaleUrl, "Start GravyBlock — $39.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">$39.99/month · Cancel anytime · 30-day money-back guarantee</p>
      <p style="color:#71717a;font-size:12px;margin:12px 0"><a href="${reportUrl}" style="color:#dc2626">View my full report</a></p>
    `, email, leadId),
  },
  {
    day: 10,
    subject: ({ businessName }) => `Last note about ${businessName}'s scan`,
    html: ({ name, businessName, email, leadId, scaleUrl, reportUrl }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Last note</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">GravyBlock is $39.99 a month, and low risk to try</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">This is the last routine email about your scan. If you'd like GravyBlock to work on ${businessName}'s visibility, it's one plan at $39.99 a month. There's no contract, you can cancel anytime, and if you're not satisfied in the first 30 days we'll refund you.</p>
      ${btn(scaleUrl, "Start GravyBlock — $39.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">$39.99/month · Cancel anytime · 30-day money-back guarantee</p>
      <p style="color:#71717a;font-size:12px;margin:12px 0">Your report stays available: <a href="${reportUrl}" style="color:#dc2626">view my full report</a>. After today we won't send more sales emails unless you run a new scan.</p>
    `, email, leadId),
  },
];

async function getLeadScore(businessId: string | null): Promise<number | null> {
  if (!businessId) return null;
  const db = getDb();
  if (!db) return null;
  const [snap] = await db
    .select({ score: visibilitySnapshots.overallScore })
    .from(visibilitySnapshots)
    .where(eq(visibilitySnapshots.businessId, businessId))
    .orderBy(visibilitySnapshots.createdAt)
    .limit(1);
  return snap?.score ?? null;
}

function dripJobType(day: number) {
  return `lead_drip_day_${day}`;
}

async function hasDripSent(leadId: string, day: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, dripJobType(day)), eq(sql`payload->>'leadId'`, leadId)))
    .limit(1);
  return Boolean(row);
}

async function recordDripSent(leadId: string, day: number) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: dripJobType(day),
    status: "completed",
    payload: { leadId },
  });
}

async function sendDripEmail(lead: { email: string }, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;

  // Authoritative pause check, right at the send boundary — lead drip
  // targets unconverted prospects, the same acquisition-send category the
  // admin pause switch is meant to cover. See pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(lead.email);
  if (!pauseCheck.allowed) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [lead.email], subject, html }),
  });
  return res.ok;
}

export async function runLeadDripBatch(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const cutoffDate = new Date(Date.now() - DRIP_DAYS * 24 * 60 * 60 * 1000);

  // Get all unconverted leads created in the drip window
  const allLeads = await db
    .select({
      id: leads.id,
      name: leads.name,
      email: leads.email,
      businessId: leads.businessId,
      businessName: businesses.name,
      reportPublicId: leads.reportPublicId,
      vertical: leads.vertical,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(businesses, eq(leads.businessId, businesses.id))
    .where(
      and(
        gte(leads.createdAt, cutoffDate),
        ne(leads.pipelineStatus, "converted"),
        ne(leads.pipelineStatus, "unsubscribed"),
        ne(leads.email, ""),
      ),
    )
    .limit(200);

  // Get emails of converted leads (have a paid business)
  const convertedEmails = new Set<string>();
  const paidTiers = ["starter", "growth", "pro", "agency"];
  const paidBusinesses = await db
    .select({ billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(inArray(businesses.planTier, paidTiers));
  for (const b of paidBusinesses) {
    if (b.billingEmail) convertedEmails.add(b.billingEmail.toLowerCase());
  }

  let sent = 0;
  let skipped = 0;

  for (const lead of allLeads) {
    // Skip if they converted or opted out
    if (convertedEmails.has(lead.email.toLowerCase())) {
      skipped++;
      continue;
    }
    if (await isOptedOut(lead.email)) {
      skipped++;
      continue;
    }

    const ageMs = Date.now() - new Date(lead.createdAt).getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    // Day 1 is the day of the scan. Send the latest follow-up that is due and has not been sent.
    const dayNumber = Math.min(ageDays + 1, DRIP_DAYS);
    const emailDef = [...DRIP_SEQUENCE].reverse().find((e) => e.day <= dayNumber);
    if (!emailDef) { skipped++; continue; }
    const targetDay = emailDef.day;

    if (await hasDripSent(lead.id, targetDay)) {
      skipped++;
      continue;
    }

    const score = await getLeadScore(lead.businessId);
    // The lead already gave us their email to get this report, so the link carries the same unlock
    // token the report-delivery email does. Plan params open the report with Scale preselected.
    const utm = `utm_source=email&utm_medium=lead_drip&utm_campaign=day_${targetDay}`;
    const reportBase = lead.reportPublicId
      ? `${siteUrl}/report/${lead.reportPublicId}?unlock=${encodeURIComponent(createReportUnlockToken(lead.reportPublicId))}`
      : null;
    const reportUrl = reportBase ? `${reportBase}&${utm}` : `${siteUrl}/scan?${utm}`;
    const scaleUrl = reportBase ? `${reportBase}&${utm}` : `${siteUrl}/scan?${utm}`;
    const topFinding = lead.reportPublicId
      ? await getReportWithContext(lead.reportPublicId).then((r) => { const fx = r?.payload.prioritizedFixes[0]; return fx ? { title: fx.title, detail: fx.detail } : null; }).catch(() => null)
      : null;

    const ctx: DripContext = {
      name: lead.name.split(" ")[0] || lead.name,
      businessName: lead.businessName || lead.name,
      score,
      vertical: lead.vertical,
      reportUrl,
      scaleUrl,
      topFinding,
      scanUrl: `${siteUrl}/scan`,
      email: lead.email,
      leadId: lead.id,
    };

    try {
      const ok = await sendDripEmail(
        lead,
        emailDef.subject(ctx),
        emailDef.html(ctx),
      );
      if (ok) {
        await recordDripSent(lead.id, targetDay);
        sent++;
      } else {
        skipped++;
      }
    } catch {
      skipped++;
    }
  }

  return { sent, skipped };
}
