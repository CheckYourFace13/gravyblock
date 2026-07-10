import { and, eq, gte, inArray, lt, ne, notInArray, sql } from "drizzle-orm";
import { getDb, leads, businesses, jobs, visibilitySnapshots } from "@/lib/db";
import { isOptedOut, unsubscribeFooter } from "@/lib/email/optout";

const DRIP_DAYS = 14;

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

const DRIP_SEQUENCE: DripEmail[] = [
  {
    day: 1,
    subject: ({ businessName, score }) =>
      score ? `${businessName} scored ${score}/100 — here's what to fix first` : `Your free local SEO scan for ${businessName}`,
    html: ({ name, businessName, score, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Your Scan Results</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Hi ${name}, here's what we found</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">
        ${score !== null ? `<strong>${businessName}</strong> scored <strong>${score}/100</strong> on local visibility, trust signals, and AI search coverage.` : `We completed the local SEO scan for <strong>${businessName}</strong>.`}
        Your full report breaks down exactly where you're losing rankings and what to fix first.
      </p>
      ${btn(reportUrl, "Open my full report →")}
      <p style="color:#71717a;font-size:13px;margin:20px 0 0">
        The biggest drivers: Google Business Profile completeness, review volume and recency, consistent citations across directories, and published local content. Your report shows exactly where ${businessName} stands on each.
      </p>
    `, email, leadId),
  },
  {
    day: 2,
    subject: ({ businessName }) => `The real reason ${businessName} loses customers before they call`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Local SEO Insight</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Customers decide in 90 seconds</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        When someone searches for a business like ${businessName}, they compare 3–5 options in about 90 seconds. The winners have complete profiles, recent reviews, and fresh content. The losers have outdated listings and missing information — even if they're the better business.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock fixes all of that automatically. Every week it publishes content, refreshes your listing signals, and queues citation and review tasks so you're always the freshest result on the page.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start Scale — $74.99 first month →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Use code <strong>INTRO50</strong> at checkout for 50% off. No contract.</p>
    `, email, leadId),
  },
  {
    day: 3,
    subject: ({ businessName }) => `Is ${businessName} showing up when people ask ChatGPT for recommendations?`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">AI Search Visibility</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">AI assistants are the new word of mouth</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        More and more people ask ChatGPT, Perplexity, and Google AI Overviews to recommend local businesses. These answers aren't random — they pull from businesses with consistent listings, strong review profiles, and published content that AI systems can verify.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock tracks whether ${businessName} gets mentioned when AI assistants answer questions about your industry and city — and runs the work that improves your chances every week.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Track my AI visibility — $74.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">
        Scale includes AI visibility monitoring, weekly ranking refreshes, published content, and Reddit outreach. Code <strong>INTRO50</strong> = 50% off first month.
      </p>
    `, email, leadId),
  },
  {
    day: 4,
    subject: ({ businessName }) => `What 30 days of autopilot looks like for ${businessName}`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">What to Expect</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Month one, week by week</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">Week 1</p>
        <p style="margin:6px 0 12px;font-size:13px;color:#52525b">GravyBlock scans ${businessName}, scores all visibility signals, and queues the first citation and review tasks.</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">Week 2</p>
        <p style="margin:6px 0 12px;font-size:13px;color:#52525b">First AI-written article goes live on your site. Reddit posting starts in local communities. Review request campaign queued.</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">Week 3</p>
        <p style="margin:6px 0 12px;font-size:13px;color:#52525b">Backlink opportunities queued. Second article drafted. Citation mismatches surfaced and flagged for correction.</p>
        <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">Week 4</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">Monthly visibility refresh. Score updates. You get a full summary of everything that ran and what's queued next month.</p>
      </div>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start Scale — $74.99 first month →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Code <strong>INTRO50</strong> at checkout. 50% off first month.</p>
    `, email, leadId),
  },
  {
    day: 5,
    subject: ({ businessName }) => `Your competitors are publishing content every week. ${businessName} isn't.`,
    html: ({ name, businessName, vertical, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Content and Rankings</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Local content = local rankings</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Google rewards businesses that publish relevant, local content consistently. ${vertical ? `For ${vertical.toLowerCase()}s, t` : "T"}hat means articles about your services, your city, your customers' questions, and what makes you different from the 4 other results on the same page.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock writes and publishes these for ${businessName} automatically — targeting the exact keywords your customers search in your city. It also posts to Reddit and local forums where your potential customers already spend time.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Most local businesses don't do this at all. That's the opportunity.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start publishing content — $74.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Code <strong>INTRO50</strong> = 50% off first month.</p>
    `, email, leadId),
  },
  {
    day: 6,
    subject: ({ businessName }) => `50% off Scale for ${businessName} — this week only`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Limited Offer</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">$74.99 first month. Full autopilot.</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Use code <strong>INTRO50</strong> at checkout — your first month of Scale drops from $149.99 to $74.99.
      </p>
      <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b">Scale includes everything:</p>
        <ul style="margin:8px 0 0;padding-left:20px;color:#3f3f46;font-size:13px;line-height:1.9">
          <li>Weekly visibility refreshes and score tracking</li>
          <li>AI-written articles published to your site automatically</li>
          <li>Reddit and blog outreach in your city and industry</li>
          <li>12 citation tasks and 8 review tasks per month</li>
          <li>8 backlink opportunities queued monthly</li>
          <li>AI search visibility monitoring (ChatGPT, Perplexity, Google AI)</li>
        </ul>
      </div>
      ${btn(`${siteUrl}/scan?plan=growth`, "Claim 50% off Scale — code INTRO50 →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">First month only. Renews at $149.99/month. Cancel any time.</p>
    `, email, leadId),
  },
  {
    day: 7,
    subject: ({ businessName }) => `still thinking about it?`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        You haven't started a plan for ${businessName} yet — totally fine. Just didn't want the report to get buried.
      </p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        If the price is the sticking point: Starter is $39.99 for the first month with code <strong>INTRO50</strong>. That's less than most businesses spend on a single Google Ads click — and this keeps running every week without you touching it.
      </p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        If you're not sure it'll work for your type of business — just reply to this email and tell me what ${businessName} does. I'll give you a straight answer.
      </p>
      ${btn(`${siteUrl}/scan?plan=starter`, "Start for $39.99 — code INTRO50")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">Your report: <a href="${reportUrl}" style="color:#dc2626">${reportUrl}</a></p>
    `, email, leadId),
  },
  {
    day: 8,
    subject: ({ businessName, score }) => score ? `${businessName} scored ${score}. Here's what that means in 30 days.` : `${businessName}: before and after one month on GravyBlock`,
    html: ({ name, businessName, score, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Before vs. After</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">What changes in 30 days</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        ${score !== null ? `${businessName} scored ${score}/100 when you scanned.` : `Your scan found gaps in ${businessName}'s local visibility.`}
        Here's what changes after one month of GravyBlock running in the background:
      </p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <p style="margin:0;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase">Right now</p>
            <ul style="margin:8px 0 0;padding-left:18px;color:#71717a;font-size:13px;line-height:1.9">
              <li>No new content being published</li>
              <li>Citation mismatches unfixed</li>
              <li>Reviews going unanswered</li>
              <li>Not mentioned in AI search</li>
            </ul>
          </div>
          <div>
            <p style="margin:0;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase">30 days in</p>
            <ul style="margin:8px 0 0;padding-left:18px;color:#3f3f46;font-size:13px;line-height:1.9">
              <li>2–4 local articles live</li>
              <li>Citation gaps fixed</li>
              <li>AI reply drafts for every review</li>
              <li>AI visibility monitored weekly</li>
            </ul>
          </div>
        </div>
      </div>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start Scale — $74.99 first month →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Code <strong>INTRO50</strong> at checkout.</p>
    `, email, leadId),
  },
  {
    day: 9,
    subject: ({ businessName }) => `3 things ${businessName} can fix on Google today — no tool needed`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Free Tips</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">3 quick wins — free, right now</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">Whether or not you ever use GravyBlock, these three things move the needle for almost every local business:</p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">1. Reply to every Google review — especially old ones</p>
        <p style="margin:6px 0 16px;font-size:13px;color:#52525b">Replying to reviews (good and bad) signals an active business. Most owners don't bother. Google notices.</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">2. Make your name, address, and phone identical everywhere</p>
        <p style="margin:6px 0 16px;font-size:13px;color:#52525b">Check Google, Yelp, Facebook, and your website. Even small differences (St. vs Street) hurt your local rank.</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">3. Add specific services to your Google Business Profile</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">Most profiles just list a category. Adding individual services (e.g. "drain cleaning," "water heater installation") helps Google match you to more specific searches.</p>
      </div>
      <p style="color:#52525b;font-size:14px;margin:12px 0">GravyBlock automates all three for ${businessName} — but if you want to start manually, these are the highest-leverage moves.</p>
      ${btn(reportUrl, "View my full report →")}
    `, email, leadId),
  },
  {
    day: 10,
    subject: ({ businessName, vertical }) => `How ${vertical ? vertical.toLowerCase() + "s" : "local businesses"} like ${businessName} use GravyBlock`,
    html: ({ name, businessName, vertical, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">How It Works</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">The first 30 days, step by step</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Here's exactly what happens when ${businessName} goes live on GravyBlock — no ongoing work required after setup:
      </p>
      <ol style="margin:12px 0;padding-left:22px;color:#3f3f46;font-size:14px;line-height:2.2">
        <li>Scans your Google listing, website, and nearby competitors. Scores all visibility signals.</li>
        <li>Writes the first ${vertical ? vertical.toLowerCase() : "local"} article targeting your city and publishes it to your site.</li>
        <li>Builds a citation checklist for the directories that matter in your industry, with your exact business data ready to copy, and flags inconsistencies.</li>
        <li>New reviews get an AI-drafted reply in your inbox. You copy and post in 10 seconds.</li>
        <li>Every week: visibility score refreshes, new content queues, outreach sends. Monthly digest shows everything that ran.</li>
      </ol>
      <p style="color:#52525b;font-size:14px;margin:12px 0">You don't need to learn SEO. It runs without you.</p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start full autopilot — $74.99/mo →")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Code <strong>INTRO50</strong> at checkout = 50% off first month.</p>
    `, email, leadId),
  },
  {
    day: 14,
    subject: ({ businessName }) => `Last email — INTRO50 expires for ${businessName}`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#dc2626">Final Notice</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Last chance at 50% off</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        This is the last time GravyBlock will email you about this. The <strong>INTRO50</strong> code — 50% off your first month — is still valid, but this sequence ends today.
      </p>
      <div style="margin:20px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px">
        <p style="margin:0;font-size:15px;font-weight:700;color:#166534">Scale — $74.99 first month (reg. $149.99)</p>
        <p style="margin:6px 0 0;font-size:13px;color:#3f3f46">Weekly AI articles, Reddit outreach, citation audit, review requests, backlink prospecting, and AI visibility monitoring. Fully automated. No contract.</p>
      </div>
      <div style="margin:12px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
        <p style="margin:0;font-size:15px;font-weight:700;color:#991b1b">Starter — $39.99 first month (reg. $79.99)</p>
        <p style="margin:6px 0 0;font-size:13px;color:#3f3f46">Monthly visibility monitoring, citation audit, review queue, and content ideas. Good starting point for ${businessName}.</p>
      </div>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start Scale — use code INTRO50")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">
        Your report stays live: <a href="${reportUrl}" style="color:#dc2626">${reportUrl}</a>
      </p>
      <p style="color:#71717a;font-size:13px;margin:0">After today, no more emails from GravyBlock unless you run a new scan.</p>
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

    // Day 0 = same day as scan, send day 1 email
    // Day 1 = next day, send day 2 email, etc.
    const targetDay = Math.min(ageDays + 1, DRIP_DAYS);
    if (targetDay < 1 || targetDay > DRIP_DAYS) {
      skipped++;
      continue;
    }

    const emailDef = DRIP_SEQUENCE[targetDay - 1];
    if (!emailDef) { skipped++; continue; }

    if (await hasDripSent(lead.id, targetDay)) {
      skipped++;
      continue;
    }

    const score = await getLeadScore(lead.businessId);
    const reportUrl = lead.reportPublicId
      ? `${siteUrl}/report/${lead.reportPublicId}`
      : `${siteUrl}/scan`;

    const ctx: DripContext = {
      name: lead.name.split(" ")[0] || lead.name,
      businessName: lead.businessName || lead.name,
      score,
      vertical: lead.vertical,
      reportUrl,
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
