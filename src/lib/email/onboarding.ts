import { and, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { getDb, businesses, leads, jobs, visibilitySnapshots } from "@/lib/db";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

function btn(href: string, label: string, color = "#dc2626") {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:100px;text-decoration:none">${label}</a>`;
}

function wrap(content: string, email?: string) {
  const unsub = email
    ? ` &middot; <a href="${siteUrl}/api/unsubscribe?e=${Buffer.from(email.toLowerCase()).toString("base64url")}" style="color:#a1a1aa">Unsubscribe</a>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
${content}
<p style="margin:32px 0 0;font-size:12px;color:#a1a1aa">GravyBlock &middot; <a href="${siteUrl}" style="color:#a1a1aa">gravyblock.com</a>${unsub}</p>
</div></body></html>`;
}

type OnboardCtx = {
  firstName: string;
  businessName: string;
  planLabel: string;
  workspaceUrl: string;
  score: number | null;
  email?: string;
};

type OnboardEmail = {
  day: number;
  subject: (ctx: OnboardCtx) => string;
  html: (ctx: OnboardCtx) => string;
};

const ONBOARD_SEQUENCE: OnboardEmail[] = [
  {
    day: 1,
    subject: ({ businessName, planLabel }) => `Welcome to GravyBlock — ${businessName} is now on ${planLabel}`,
    html: ({ firstName, businessName, planLabel, workspaceUrl, score, email }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Welcome to GravyBlock</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#18181b">You are all set, ${firstName}</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">
        ${businessName} is now on <strong>${planLabel}</strong>. Your automation is live.
        ${score !== null ? ` Current visibility score: <strong>${score}/100</strong>.` : ""}
      </p>
      <div style="margin:16px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
        <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#991b1b">One action to do right now (5 minutes)</p>
        <p style="margin:0;font-size:13px;color:#3f3f46;line-height:1.6">
          Open your workspace and complete the <strong>Business Profile</strong> — your services, target city, and brand voice.
          This is what GravyBlock uses to write content specifically about your business. Skip it and articles will be generic.
        </p>
      </div>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        After that, here is what runs automatically:
      </p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <ul style="margin:0;padding-left:20px;color:#3f3f46;font-size:13px;line-height:2">
          <li>Content ideas, citation tasks, and review tasks queue within 24 hours</li>
          <li>Your first article will be published to your site on the next scheduled run</li>
          <li>Monthly summary email arrives with everything that was done</li>
        </ul>
      </div>
      ${btn(workspaceUrl, "Complete my business profile →")}
      <p style="color:#71717a;font-size:13px;margin:20px 0 0">
        Questions? Reply to this email and we will get back to you quickly.
      </p>
    `, email),
  },
  {
    day: 3,
    subject: ({ businessName }) => `3 things to do this week for ${businessName}`,
    html: ({ firstName, businessName, workspaceUrl, email }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Quick Wins</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#18181b">3 things worth doing this week</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${firstName},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock handles the ongoing automation for ${businessName}. Here are three things you can do manually this week that will accelerate your results:
      </p>
      <div style="margin:16px 0">
        <div style="padding:14px;background:#f4f4f5;border-radius:10px;margin-bottom:10px">
          <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">1. Ask your last 5 customers for a Google review</p>
          <p style="margin:6px 0 0;font-size:13px;color:#52525b">Review recency is the fastest way to move your local ranking. A personal text or message converts at 30–40%.</p>
        </div>
        <div style="padding:14px;background:#f4f4f5;border-radius:10px;margin-bottom:10px">
          <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">2. Add or update your Google Business Profile photos</p>
          <p style="margin:6px 0 0;font-size:13px;color:#52525b">Profiles with recent photos get 35% more direction requests and 42% more website clicks on average.</p>
        </div>
        <div style="padding:14px;background:#f4f4f5;border-radius:10px">
          <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">3. Check your workspace for new action items</p>
          <p style="margin:6px 0 0;font-size:13px;color:#52525b">Your automation queue has started. Citation tasks and content ideas are waiting in your workspace.</p>
        </div>
      </div>
      ${btn(workspaceUrl, "Open my workspace")}
    `, email),
  },
  {
    day: 7,
    subject: ({ businessName }) => `First week recap: what GravyBlock has done for ${businessName}`,
    html: ({ firstName, businessName, planLabel, workspaceUrl, score, email }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Week One</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#18181b">Your first week on ${planLabel}</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${firstName},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        It has been one week since ${businessName} joined GravyBlock. Here is what is happening:
      </p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        ${score !== null ? `<p style="margin:0;font-size:15px;color:#18181b">Current visibility score: <strong style="font-size:20px;color:#dc2626">${score}/100</strong></p>` : ""}
        <ul style="margin:${score !== null ? "12px" : "0"} 0 0;padding-left:20px;color:#3f3f46;font-size:13px;line-height:2">
          <li>Automation jobs have been queued and are running on schedule</li>
          <li>Content ideas, citation tasks, and review tasks are in your workspace queue</li>
          <li>AI visibility checks are monitoring whether your business is being recommended</li>
          <li>Monthly summary email will arrive at the end of your first automation cycle</li>
        </ul>
      </div>
      <p style="color:#52525b;font-size:14px;margin:16px 0">
        Your workspace shows everything that has been done and what is queued next. Open it any time to review action items or approve content drafts.
      </p>
      ${btn(workspaceUrl, "Open my workspace")}
      <p style="color:#71717a;font-size:13px;margin:20px 0 0">
        Need help getting more out of GravyBlock? Reply to this email — we read every response.
      </p>
    `, email),
  },
];

async function getBusinessScore(businessId: string): Promise<number | null> {
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

function onboardJobType(day: number) {
  return `onboard_day_${day}`;
}

async function hasOnboardSent(businessId: string, day: number): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.type, onboardJobType(day)), eq(sql`payload->>'businessId'`, businessId)))
    .limit(1);
  return Boolean(row);
}

async function recordOnboardSent(businessId: string, day: number) {
  const db = getDb();
  if (!db) return;
  await db.insert(jobs).values({
    type: onboardJobType(day),
    businessId,
    status: "completed",
    payload: { businessId, sentAt: new Date().toISOString() },
  });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  return res.ok;
}

export async function runOnboardingBatch(): Promise<{ sent: number; skipped: number }> {
  const db = getDb();
  if (!db) return { sent: 0, skipped: 0 };

  const paidTiers = ["starter", "growth", "pro", "agency"];
  const windowStart = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  const paidBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      planTier: businesses.planTier,
      billingEmail: businesses.billingEmail,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(
      and(
        inArray(businesses.planTier, paidTiers),
        gte(businesses.createdAt, windowStart),
        ne(businesses.accountType, "house"),
      ),
    )
    .limit(200);

  let sent = 0;
  let skipped = 0;

  for (const biz of paidBusinesses) {
    if (!biz.billingEmail) { skipped++; continue; }

    const ageMs = Date.now() - new Date(biz.createdAt).getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    for (const emailDef of ONBOARD_SEQUENCE) {
      if (ageDays < emailDef.day) continue;
      if (ageDays > emailDef.day + 1) continue;

      if (await hasOnboardSent(biz.id, emailDef.day)) { skipped++; continue; }

      const score = await getBusinessScore(biz.id);

      // Try to get first name from leads table
      const [leadRow] = await db
        .select({ name: leads.name })
        .from(leads)
        .where(eq(leads.businessId, biz.id))
        .limit(1);
      const fullName = leadRow?.name ?? "";
      const firstName = fullName.split(" ")[0] || "there";

      const planLabel = biz.planTier
        ? biz.planTier.charAt(0).toUpperCase() + biz.planTier.slice(1)
        : "GravyBlock";

      const ctx: OnboardCtx = {
        firstName,
        businessName: biz.name,
        planLabel,
        workspaceUrl: `${siteUrl}/workspace/${biz.id}`,
        score,
        email: biz.billingEmail,
      };

      try {
        const ok = await sendEmail(biz.billingEmail, emailDef.subject(ctx), emailDef.html(ctx));
        if (ok) {
          await recordOnboardSent(biz.id, emailDef.day);
          sent++;
        } else {
          skipped++;
        }
      } catch {
        skipped++;
      }
    }
  }

  return { sent, skipped };
}
