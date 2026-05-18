/**
 * Monthly digest email for paid business owners.
 * Sent on the 1st of each month showing what automation ran last month.
 * Tracked via jobs table: type = "monthly_digest_sent", payload = { businessId }.
 */

import { and, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb, businesses, contentQueue, publishedContent, visibilitySnapshots, operatorTasks, jobs, aiVisibilityChecks, auditFindings, citationMonitors, socialProfiles } from "@/lib/db";
import { normalizePlanTierFromDb, planFeatures } from "@/lib/plans";
import { computeAeoScore, getGrade } from "@/lib/scoring/aeo-score";
import { computeEntityScore } from "@/lib/scoring/entity-score";
import type { WebsiteAuditSummary } from "@/lib/report/types";

const PAID_TIERS = ["starter", "growth", "pro", "agency", "base", "managed", "entry"];
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>",
  };
}

async function sendEmail(to: string, subject: string, html: string) {
  const cfg = resendConfig();
  if (!cfg.apiKey) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({ from: cfg.from, to: [to], subject, html }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
}

function buildDigestHtml(params: {
  businessName: string;
  planLabel: string;
  monthLabel: string;
  workspaceUrl: string;
  contentQueued: number;
  contentPublished: number;
  snapshotsTaken: number;
  latestScore: number | null;
  scoreDelta: number | null;
  tasksCompleted: number;
  outreachSent: number;
  aeoScore?: number | null;
  aeoGrade?: string | null;
  geoScore?: number | null;
  geoGrade?: string | null;
  entityScore?: number | null;
  aiProbesRun?: number;
  citationChecks?: number;
  businessEmail?: string;
}): string {
  const {
    businessName, planLabel, monthLabel, workspaceUrl,
    contentQueued, contentPublished, snapshotsTaken,
    latestScore, scoreDelta, tasksCompleted, outreachSent,
    aeoScore = null, aeoGrade = null,
    geoScore = null, geoGrade = null,
    entityScore = null,
    aiProbesRun = 0, citationChecks = 0,
  } = params;

  const scoreSection = latestScore !== null
    ? `<p style="margin:0 0 8px;font-size:15px;color:#444;line-height:1.6;">
        Your latest SEO visibility score is <strong>${latestScore}/100</strong>${
          scoreDelta !== null
            ? ` — <strong>${scoreDelta >= 0 ? "+" : ""}${scoreDelta} points</strong> vs. last month`
            : ""
        }.
       </p>`
    : "";

  const hasAnyNewScore = aeoScore !== null || geoScore !== null || entityScore !== null;
  const newScoresSection = hasAnyNewScore
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;background:#f9f9f9;border-radius:8px;overflow:hidden;">
        <tr>
          <td colspan="3" style="padding:12px 16px 4px;font-size:12px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.08em;">
            Your 3 additional scores
          </td>
        </tr>
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#444;border-top:1px solid #e5e5e5;">AEO Score</td>
          <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#111;border-top:1px solid #e5e5e5;">${aeoScore !== null ? `${aeoScore}/100` : "—"}${aeoGrade ? ` (${aeoGrade})` : ""}</td>
          <td style="padding:8px 16px 8px 0;font-size:12px;color:#666;border-top:1px solid #e5e5e5;">Answer Engine Optimization</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#444;border-top:1px solid #e5e5e5;">GEO Score</td>
          <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#111;border-top:1px solid #e5e5e5;">${geoScore !== null ? `${geoScore}/100` : "—"}${geoGrade ? ` (${geoGrade})` : ""}</td>
          <td style="padding:8px 16px 8px 0;font-size:12px;color:#666;border-top:1px solid #e5e5e5;">AI assistant visibility</td>
        </tr>
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#444;border-top:1px solid #e5e5e5;">Entity Score</td>
          <td style="padding:8px 8px;font-size:14px;font-weight:700;color:#111;border-top:1px solid #e5e5e5;">${entityScore !== null ? `${entityScore}/100` : "—"}</td>
          <td style="padding:8px 16px 8px 0;font-size:12px;color:#666;border-top:1px solid #e5e5e5;">Business info consistency</td>
        </tr>
      </table>`
    : "";

  const automationWins = [
    contentPublished > 0 ? `${contentPublished} article${contentPublished !== 1 ? "s" : ""} published &rarr; improved AEO signals` : null,
    aiProbesRun > 0 ? `${aiProbesRun} AI citation probe${aiProbesRun !== 1 ? "s" : ""} run &rarr; tracking your GEO score` : null,
    citationChecks > 0 ? `${citationChecks} citation check${citationChecks !== 1 ? "s" : ""} completed &rarr; protecting your Entity score` : null,
  ].filter(Boolean);

  const automationWinsSection = automationWins.length > 0
    ? `<div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.08em;">What we did for your scores this month</p>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:#14532d;line-height:2;">
          ${automationWins.map((w) => `<li>${w}</li>`).join("")}
        </ul>
      </div>`
    : "";

  const stats = [
    { label: "Content pieces generated", value: contentQueued },
    { label: "Content items published", value: contentPublished },
    { label: "Visibility snapshots taken", value: snapshotsTaken },
    { label: "Automation tasks completed", value: tasksCompleted },
    { label: "Outreach drafts created", value: outreachSent },
  ].filter((s) => s.value > 0);

  const statsHtml = stats.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border-collapse:collapse;">
        ${stats.map((s) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#444;">${s.label}</td>
          <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;font-weight:700;color:#111;text-align:right;">${s.value}</td>
        </tr>`).join("")}
       </table>`
    : `<p style="font-size:14px;color:#666;margin:16px 0;">
        Your workspace is set up and ready. Automation will begin running on the next scheduled cycle.
       </p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid #e5e5e5;background:#111;">
  <p style="margin:0;font-size:20px;font-weight:700;color:#fff;">GravyBlock</p>
  <p style="margin:4px 0 0;font-size:13px;color:#999;">${monthLabel} autopilot summary</p>
</td></tr>
<tr><td style="padding:32px 40px;">
  <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111;line-height:1.3;">
    Here is what ran for ${businessName} last month
  </h1>
  <p style="margin:0 0 12px;font-size:14px;color:#666;">Plan: <strong>${planLabel}</strong></p>
  ${scoreSection}
  ${newScoresSection}
  ${statsHtml}
  ${automationWinsSection}
  <p style="margin:24px 0 8px;font-size:14px;color:#444;">
    See the full activity log and your content queue in your workspace:
  </p>
  <a href="${workspaceUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;">
    Open my workspace
  </a>
</td></tr>
<tr><td style="padding:24px 40px;border-top:1px solid #e5e5e5;">
  <p style="margin:0;font-size:13px;color:#888;">
    GravyBlock &bull; <a href="${siteUrl}" style="color:#888;">gravyblock.com</a>
    &bull; <a href="${workspaceUrl}" style="color:#888;">Manage your plan</a>
    &bull; <a href="${siteUrl}/api/unsubscribe?e=${Buffer.from(params.businessEmail?.toLowerCase() ?? "").toString("base64url")}" style="color:#888;">Unsubscribe</a>
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export async function runMonthlyDigestBatch(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthLabel = lastMonthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const paid = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      billingEmail: businesses.billingEmail,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .where(inArray(businesses.planTier, PAID_TIERS))
    .limit(100);

  let sent = 0;
  let skipped = 0;

  for (const biz of paid) {
    if (!biz.billingEmail) { skipped++; continue; }

    // Check if already sent this month
    const [existing] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.type, "monthly_digest_sent"),
          gte(jobs.createdAt, monthStart),
          sql`${jobs.payload}->>'businessId' = ${biz.id}`,
        ),
      )
      .limit(1);

    if (existing) { skipped++; continue; }

    try {
      // Gather last month's stats
      const [contentQueuedRow, contentPublishedRow, snapshotsRow, tasksRow, outreachRow, aiChecksRow, citationRow, socialRow, findingsRow, bizRow] = await Promise.all([
        db.select({ count: count() }).from(contentQueue).where(
          and(eq(contentQueue.businessId, biz.id), gte(contentQueue.createdAt, lastMonthStart), lt(contentQueue.createdAt, monthStart))
        ),
        db.select({ count: count() }).from(publishedContent).where(
          and(eq(publishedContent.businessId, biz.id), gte(publishedContent.createdAt, lastMonthStart), lt(publishedContent.createdAt, monthStart))
        ),
        db.select({ overallScore: visibilitySnapshots.overallScore, createdAt: visibilitySnapshots.createdAt })
          .from(visibilitySnapshots)
          .where(eq(visibilitySnapshots.businessId, biz.id))
          .orderBy(sql`${visibilitySnapshots.createdAt} desc`)
          .limit(2),
        db.select({ count: count() }).from(operatorTasks).where(
          and(
            eq(operatorTasks.businessId, biz.id),
            inArray(operatorTasks.status, ["done", "completed"]),
            gte(operatorTasks.createdAt, lastMonthStart),
            lt(operatorTasks.createdAt, monthStart),
          )
        ),
        db.select({ count: count() }).from(operatorTasks).where(
          and(
            eq(operatorTasks.businessId, biz.id),
            eq(operatorTasks.queue, "outreach_ops"),
            gte(operatorTasks.createdAt, lastMonthStart),
            lt(operatorTasks.createdAt, monthStart),
          )
        ),
        // For score computation
        db.select({ mentionFound: aiVisibilityChecks.mentionFound }).from(aiVisibilityChecks)
          .where(eq(aiVisibilityChecks.businessId, biz.id)).limit(60),
        db.select({ mismatchNote: citationMonitors.mismatchNote }).from(citationMonitors)
          .where(eq(citationMonitors.businessId, biz.id)).limit(100),
        db.select({ id: socialProfiles.id }).from(socialProfiles)
          .where(eq(socialProfiles.businessId, biz.id)).limit(10),
        db.select({ title: auditFindings.title, category: auditFindings.category })
          .from(auditFindings).where(eq(auditFindings.businessId, biz.id)).limit(50),
        db.select({ website: businesses.website, phone: businesses.phone, address: businesses.address })
          .from(businesses).where(eq(businesses.id, biz.id)).limit(1),
      ]);

      const latestScore = snapshotsRow[0]?.overallScore ?? null;
      const prevScore = snapshotsRow[1]?.overallScore ?? null;
      const scoreDelta = latestScore !== null && prevScore !== null ? latestScore - prevScore : null;

      // Compute AEO, GEO, Entity scores
      const bizDetails = bizRow[0] ?? null;
      function findingHas(...terms: string[]) {
        return findingsRow.some((f) =>
          terms.some((t) => f.title.toLowerCase().includes(t) || f.category.toLowerCase().includes(t)),
        );
      }
      const syntheticAudit: WebsiteAuditSummary | null = findingsRow.length > 0
        ? {
            score: 0,
            findings: [],
            signals: {
              hasTitle: !findingHas("title tag", "no title", "missing title"),
              hasMetaDescription: !findingHas("meta description", "description tag"),
              hasH1: !findingHas("h1", "heading"),
              hasViewport: !findingHas("viewport", "mobile"),
              hasStructuredData: !findingHas("structured data", "schema", "json-ld"),
              hasClickToCall: !findingHas("phone", "tel:", "click to call", "telephone"),
              locationClarity: !findingHas("location", "service area", "city"),
              hoursClarity: !findingHas("hours", "open", "schedule"),
              ctaClarity: !findingHas("call to action", "cta", "contact"),
              speedHook: "not_tested",
            },
          }
        : null;

      const publishedCount = contentPublishedRow[0]?.count ?? 0;
      const aeoResult = computeAeoScore({
        websiteAudit: syntheticAudit,
        publishedContentCount: publishedCount,
        hasSchemaMarkup: !findingHas("structured data", "schema", "json-ld"),
        reviewCount: 0,
      });

      const totalAiChecks = aiChecksRow.length;
      const mentionedAiChecks = aiChecksRow.filter((c) => c.mentionFound === "true").length;
      const geoScore = totalAiChecks > 0 ? Math.round((mentionedAiChecks / totalAiChecks) * 100) : null;
      const geoGrade = geoScore !== null ? getGrade(geoScore) : null;

      const citationMismatches = citationRow.filter((c) => c.mismatchNote !== null).length;
      const entityResult = computeEntityScore({
        citationMismatches,
        citationTotal: citationRow.length,
        socialProfilesFound: socialRow.length,
        hasWebsite: Boolean(bizDetails?.website),
        hasPhone: Boolean(bizDetails?.phone),
        hasAddress: Boolean(bizDetails?.address),
        aiMentionRate: totalAiChecks > 0 ? mentionedAiChecks / totalAiChecks : 0,
      });

      const tier = normalizePlanTierFromDb(biz.planTier);
      const features = planFeatures(tier);
      const workspaceUrl = `${siteUrl}/workspace/${biz.id}`;

      await sendEmail(
        biz.billingEmail,
        `Your GravyBlock summary for ${monthLabel} — ${biz.name}`,
        buildDigestHtml({
          businessName: biz.name,
          planLabel: features.label,
          monthLabel,
          workspaceUrl,
          contentQueued: contentQueuedRow[0]?.count ?? 0,
          contentPublished: publishedCount,
          snapshotsTaken: snapshotsRow.length,
          latestScore,
          scoreDelta,
          tasksCompleted: tasksRow[0]?.count ?? 0,
          outreachSent: outreachRow[0]?.count ?? 0,
          aeoScore: aeoResult.score,
          aeoGrade: aeoResult.grade,
          geoScore,
          geoGrade,
          entityScore: entityResult.score,
          aiProbesRun: totalAiChecks,
          citationChecks: citationRow.length,
          businessEmail: biz.billingEmail,
        }),
      );

      await db.insert(jobs).values({
        type: "monthly_digest_sent",
        status: "completed",
        payload: { businessId: biz.id, email: biz.billingEmail, month: lastMonthStart.toISOString() },
      });

      sent++;
    } catch (err) {
      console.error("[monthly-digest] send failed", {
        businessId: biz.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  return { sent, skipped };
}
