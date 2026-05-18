import { desc, eq, gte, and, ne, sql } from "drizzle-orm";
import { getDb, businesses, leads, visibilitySnapshots, jobs, contentQueue, operatorTasks, publishedContent, aiVisibilityChecks, auditFindings } from "@/lib/db";
import { normalizePlanTierFromDb, planFeatures, type PlanTier } from "@/lib/plans";
import { computeAeoScore } from "@/lib/scoring/aeo-score";
import type { WebsiteAuditSummary } from "@/lib/report/types";

const NEXT_TIER: Record<PlanTier, PlanTier | null> = {
  free: "starter",
  starter: "growth",
  growth: "pro",
  pro: "agency",
  agency: null,
};

const UPSELL_PITCH: Record<string, { headline: string; bullets: string[] }> = {
  starter: {
    headline: "Growth would have also done this week:",
    bullets: [
      "Written and published 1 SEO article to your site",
      "Posted on 2 relevant Reddit threads with your business linked",
      "Sent outreach to 2 local blogs or directories",
      "Queued 2 backlink opportunities",
      "Sent a 3-step follow-up sequence to warm leads",
    ],
  },
  growth: {
    headline: "Pro would have also done this week:",
    bullets: [
      "Built 2 programmatic SEO pages targeting your city + service combos",
      "Synced and posted to Google Business Profile",
      "Monitored all 3 of your business locations",
      "Queued 5 citation fixes and 5 review tasks",
    ],
  },
  pro: {
    headline: "Agency would have also done this week:",
    bullets: [
      "Run the same full autopilot for up to 10 client businesses",
      "Generated white-label PDF reports for each client",
      "Used the cold outreach engine to find and pitch new prospects",
      "Refreshed all clients daily instead of weekly",
    ],
  },
};

async function getWeeklyActivity(businessId: string) {
  const db = getDb();
  if (!db) return null;
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceStr = since.toISOString();

  const [snapshots, contentItems, reviewTasks, published] = await Promise.all([
    db.select({ score: visibilitySnapshots.overallScore, createdAt: visibilitySnapshots.createdAt })
      .from(visibilitySnapshots).where(and(eq(visibilitySnapshots.businessId, businessId), gte(visibilitySnapshots.createdAt, since))).orderBy(desc(visibilitySnapshots.createdAt)).limit(1),
    db.select({ id: contentQueue.id }).from(contentQueue)
      .where(and(eq(contentQueue.businessId, businessId), gte(contentQueue.createdAt, since))),
    db.select({ id: operatorTasks.id }).from(operatorTasks)
      .where(and(eq(operatorTasks.businessId, businessId), gte(operatorTasks.createdAt, since))),
    db.select({ id: publishedContent.id }).from(publishedContent)
      .where(and(eq(publishedContent.businessId, businessId), gte(publishedContent.createdAt, since))),
  ]);

  return {
    latestScore: snapshots[0]?.score ?? null,
    contentQueued: contentItems.length,
    tasksDone: reviewTasks.length,
    articlesPublished: published.length,
  };
}

async function getAeoAndGeoScores(businessId: string): Promise<{ aeoScore: number | null; geoScore: number | null }> {
  const db = getDb();
  if (!db) return { aeoScore: null, geoScore: null };

  try {
    const [findings, aiChecks, published] = await Promise.all([
      db.select({ title: auditFindings.title, category: auditFindings.category, severity: auditFindings.severity, detail: auditFindings.detail })
        .from(auditFindings).where(eq(auditFindings.businessId, businessId)).limit(50),
      db.select({ mentionFound: aiVisibilityChecks.mentionFound })
        .from(aiVisibilityChecks).where(eq(aiVisibilityChecks.businessId, businessId)).limit(60),
      db.select({ id: publishedContent.id }).from(publishedContent)
        .where(and(eq(publishedContent.businessId, businessId), eq(publishedContent.status, "published"))).limit(100),
    ]);

    function titleHas(...terms: string[]) {
      return findings.some((f) => terms.some((t) => f.title.toLowerCase().includes(t) || f.category.toLowerCase().includes(t)));
    }
    // A finding in the DB means there's a problem — so "no-X" finding means the signal fails
    const syntheticAudit: WebsiteAuditSummary = {
      score: 0,
      findings: [],
      signals: {
        hasTitle: !titleHas("title tag", "no title", "missing title"),
        hasMetaDescription: !titleHas("meta description", "description tag"),
        hasH1: !titleHas("h1", "heading"),
        hasViewport: !titleHas("viewport", "mobile"),
        hasStructuredData: !titleHas("structured data", "schema", "json-ld"),
        hasClickToCall: !titleHas("phone", "tel:", "click to call", "telephone"),
        locationClarity: !titleHas("location", "service area", "city"),
        hoursClarity: !titleHas("hours", "open", "schedule"),
        ctaClarity: !titleHas("call to action", "cta", "contact"),
        speedHook: "not_tested",
      },
    };

    const total = aiChecks.length;
    const mentioned = aiChecks.filter((c) => c.mentionFound === "true").length;
    const geoScore = total > 0 ? Math.round((mentioned / total) * 100) : null;

    const aeoResult = computeAeoScore({
      websiteAudit: findings.length > 0 ? syntheticAudit : null,
      publishedContentCount: published.length,
      hasSchemaMarkup: !titleHas("structured data", "schema", "json-ld"),
      reviewCount: 0, // not fetched here — conservative
    });

    return { aeoScore: aeoResult.score, geoScore };
  } catch {
    return { aeoScore: null, geoScore: null };
  }
}

async function sendUpsellEmail(
  to: string,
  businessName: string,
  tier: PlanTier,
  activity: NonNullable<Awaited<ReturnType<typeof getWeeklyActivity>>>,
  workspaceUrl: string,
  upgradeUrl: string,
  extras?: { aeoScore?: number | null; geoScore?: number | null },
) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return;

  const nextTier = NEXT_TIER[tier];
  if (!nextTier) return;
  const pitch = UPSELL_PITCH[tier];
  if (!pitch) return;

  const nextFeatures = planFeatures(nextTier);
  const aeoScore = extras?.aeoScore ?? null;
  const geoScore = extras?.geoScore ?? null;

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock Weekly Update</p>
  <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">What happened for ${businessName} this week</h1>

  <div style="margin:20px 0;padding:16px;background:#f4f4f5;border-radius:12px">
    <p style="margin:0;font-size:13px;font-weight:600;color:#52525b;text-transform:uppercase;letter-spacing:0.1em">This week on ${planFeatures(tier).label}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 0;border-collapse:collapse;">
      ${activity.latestScore !== null ? `<tr>
        <td style="padding: 4px 0; color: #71717a; font-size: 13px;">SEO visibility score</td>
        <td style="padding: 4px 0; font-weight: 600; color: #18181b;">${activity.latestScore}/100</td>
      </tr>` : ""}
      <tr>
        <td style="padding: 4px 0; color: #71717a; font-size: 13px;">AEO score</td>
        <td style="padding: 4px 0; font-weight: 600; color: #18181b;">${aeoScore !== null ? `${aeoScore}/100` : "—"}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0; color: #71717a; font-size: 13px;">GEO score</td>
        <td style="padding: 4px 0; font-weight: 600; color: #18181b;">${geoScore !== null ? `${geoScore}/100` : "—"}</td>
      </tr>
    </table>
    <ul style="margin:8px 0 0;padding-left:20px;color:#3f3f46;font-size:14px;line-height:1.8">
      <li><strong>${activity.contentQueued}</strong> content ideas queued</li>
      <li><strong>${activity.articlesPublished}</strong> articles published</li>
      <li><strong>${activity.tasksDone}</strong> tasks completed (citations, reviews)</li>
    </ul>
  </div>

  <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
    <p style="margin:0;font-size:13px;font-weight:700;color:#991b1b">${pitch.headline}</p>
    <ul style="margin:8px 0 0;padding-left:20px;color:#3f3f46;font-size:14px;line-height:1.8">
      ${pitch.bullets.map((b) => `<li>${b}</li>`).join("")}
    </ul>
  </div>

  <p style="color:#52525b;font-size:14px;margin:16px 0">
    Upgrade to <strong>${nextFeatures.label}</strong> for $${nextFeatures.introPrice}/month introductory pricing (use code <strong>INTRO50</strong>).
  </p>

  <div style="margin:16px 0;padding:14px 16px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#52525b;text-transform:uppercase;letter-spacing:0.1em">Competitor insight</p>
    <p style="margin:6px 0 0;font-size:13px;color:#3f3f46;line-height:1.6">
      BrightLocal charges $29–$79/month just for citation tracking. Yext charges $199+/year just for listing sync.
      GravyBlock automates citations, content, reviews, AND tracks your AI search visibility — all in one.
    </p>
  </div>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <a href="${upgradeUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:13px;padding:10px 22px;border-radius:100px;text-decoration:none">
      Upgrade to ${nextFeatures.label} →
    </a>
    <a href="${workspaceUrl}" style="display:inline-block;background:#f4f4f5;color:#18181b;font-weight:600;font-size:13px;padding:10px 22px;border-radius:100px;text-decoration:none">
      View workspace
    </a>
  </div>
  <p style="color:#a1a1aa;font-size:11px;margin:24px 0 0">
    You're receiving this because you have an active GravyBlock plan for ${businessName}.
    <a href="${workspaceUrl}" style="color:#dc2626">Manage billing</a> &middot;
    <a href="https://gravyblock.com/api/unsubscribe?e=${Buffer.from(to.toLowerCase()).toString("base64url")}" style="color:#a1a1aa">Unsubscribe</a>
  </p>
</div>
</body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: `GravyBlock weekly update — ${businessName}`, html }),
  }).catch((err) => console.error("[upsell-email] send failed", err));
}

export async function sendWeeklyUpsellEmails(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const paidBusinesses = await db
    .select({ id: businesses.id, name: businesses.name, planTier: businesses.planTier, billingEmail: businesses.billingEmail })
    .from(businesses)
    .where(and(ne(businesses.planTier, "free"), eq(businesses.subscriptionStatus, "active")));

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  let sent = 0;
  let skipped = 0;

  for (const biz of paidBusinesses) {
    if (!biz.billingEmail) { skipped++; continue; }
    const tier = normalizePlanTierFromDb(biz.planTier);
    if (!NEXT_TIER[tier]) { skipped++; continue; } // agency has no upsell

    const activity = await getWeeklyActivity(biz.id);
    if (!activity) { skipped++; continue; }

    // Skip if this email address has opted out of marketing emails
    const [optOut] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.type, "email_optout"), eq(sql`lower(payload->>'email')`, biz.billingEmail.toLowerCase())))
      .limit(1)
      .catch(() => []);
    if (optOut) { skipped++; continue; }

    const scores = await getAeoAndGeoScores(biz.id);
    const workspaceUrl = `${base}/workspace/${biz.id}`;
    const nextTier = NEXT_TIER[tier]!;
    const upgradeUrl = `${base}/workspace/${biz.id}?plan=${nextTier}#billing`;

    await sendUpsellEmail(biz.billingEmail, biz.name, tier, activity, workspaceUrl, upgradeUrl, scores);

    await db.insert(jobs).values({
      businessId: biz.id,
      type: "weekly_upsell_email_sent",
      status: "completed",
      payload: { tier, to: biz.billingEmail },
    });
    sent++;
  }

  return { sent, skipped };
}
