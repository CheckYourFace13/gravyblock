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
      score ? `${businessName} scored ${score} on your free local SEO scan` : `Your free local SEO scan for ${businessName}`,
    html: ({ name, businessName, score, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Your Scan Results</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Hi ${name}, here is what we found</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">
        ${score !== null ? `<strong>${businessName}</strong> scored <strong>${score}/100</strong> on local visibility, trust signals, and AI search coverage.` : `We completed the local SEO scan for <strong>${businessName}</strong>.`}
        Your full report has the exact gaps and a prioritized action list.
      </p>
      ${btn(reportUrl, "Open my full report")}
      <p style="color:#71717a;font-size:13px;margin:20px 0 0">
        The biggest drivers of local search rankings are Google Business Profile completeness, review volume and recency, consistent citations across directories, and published local content. Your report shows exactly where ${businessName} stands on each.
      </p>
    `, email, leadId),
  },
  {
    day: 2,
    subject: ({ businessName }) => `The most common reason ${businessName} loses customers before they call`,
    html: ({ name, businessName, scanUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Local SEO Insight</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Most customers decide before they call</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        When someone searches for a business like ${businessName}, they compare three to five options in about 90 seconds. The businesses that win are the ones with complete profiles, recent reviews, and clear service information.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        The ones that lose are often great businesses with outdated listings, inconsistent phone numbers across directories, or no recent content for Google to surface.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock fixes all of that automatically. Every month it refreshes your visibility score, queues citation fixes, and generates content ideas to keep your listing fresh and competitive.
      </p>
      ${btn(`${siteUrl}/scan?plan=starter`, "Start Starter for $39.99 introductory")}
    `, email, leadId),
  },
  {
    day: 3,
    subject: ({ businessName }) => `Is ${businessName} showing up when people ask ChatGPT for recommendations?`,
    html: ({ name, businessName, scanUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">AI Search Visibility</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">AI assistants are the new word of mouth</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        More and more people ask ChatGPT, Perplexity, and Google AI Overviews to recommend local businesses. The results are not random. They come from businesses with consistent information, strong review profiles, and published content that AI systems can verify.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock monitors whether ${businessName} is being mentioned in AI-assisted search results and helps build the signals that get you recommended.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Start Scale for $74.99 introductory")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">
        Scale includes AI visibility monitoring, weekly refreshes, published content, and Reddit outreach. Use code <strong>INTRO50</strong> for 50% off your first month.
      </p>
    `, email, leadId),
  },
  {
    day: 4,
    subject: ({ businessName }) => `What 30 days of autopilot looks like for ${businessName}`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">What to Expect</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Here is what happens in month one</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <p style="margin:0;font-size:13px;font-weight:700;color:#18181b">Week 1</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">GravyBlock scans ${businessName}, scores all visibility signals, and queues the first set of citation and review tasks for your action list.</p>
        <p style="margin:12px 0 0;font-size:13px;font-weight:700;color:#18181b">Week 2</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">First AI-written article published to your site. Reddit posting begins in relevant local communities. Review request campaign queued.</p>
        <p style="margin:12px 0 0;font-size:13px;font-weight:700;color:#18181b">Week 3</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">Backlink opportunities identified and queued. Second content piece drafted. Citation inconsistencies surfaced for correction.</p>
        <p style="margin:12px 0 0;font-size:13px;font-weight:700;color:#18181b">Week 4</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">Monthly visibility refresh runs. Score updates. Summary email with everything that was done and what is queued next.</p>
      </div>
      ${btn(`${siteUrl}/scan?plan=starter`, "Start Starter — $39.99 first month")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Use code <strong>INTRO50</strong> at checkout. Scale plan available at $74.99 first month if you want full autopilot.</p>
    `, email, leadId),
  },
  {
    day: 5,
    subject: ({ businessName }) => `Your competitors are publishing content. ${businessName} should be too.`,
    html: ({ name, businessName, vertical, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Content and Rankings</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Local content drives local rankings</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Google rewards businesses that publish relevant, local content regularly. ${vertical ? `For ${vertical.toLowerCase()}s, t` : "T"}hat means articles about your services, your city, your customers' questions, and your differentiators.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        GravyBlock writes and publishes these articles for ${businessName} automatically, targeting the exact keywords your customers search for in your city.
      </p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        It also posts to Reddit and local community forums, creating backlinks and awareness in the places your potential customers actually spend time.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, "Get content running for $74.99/mo")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Use code <strong>INTRO50</strong> for 50% off your first month.</p>
    `, email, leadId),
  },
  {
    day: 6,
    subject: ({ businessName }) => `50% off this week: GravyBlock Scale for ${businessName}`,
    html: ({ name, businessName, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Limited Offer</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Start Scale for $74.99 this month</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Use code <strong>INTRO50</strong> at checkout and your first month of Growth is $74.99 instead of $149.99.
      </p>
      <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b"<>Scale includes:</p>
        <ul style="margin:8px 0 0;padding-left:20px;color:#3f3f46;font-size:13px;line-height:1.9">
          <li>Weekly visibility refreshes for ${businessName}</li>
          <li>AI-written articles published to your site every month</li>
          <li>Reddit and blog posting in your city and industry</li>
          <li>Multi-step outreach sequences with follow-ups</li>
          <li>12 citation tasks and 8 review tasks per month</li>
          <li>8 backlink opportunities queued monthly</li>
        </ul>
      </div>
      ${btn(`${siteUrl}/scan?plan=growth`, "Claim 50% off Scale — code INTRO50")}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Enter code <strong>INTRO50</strong> at checkout. Applies to first month only. Regular pricing of $149.99/month resumes at renewal.</p>
    `, email, leadId),
  },
  {
    day: 7,
    subject: ({ businessName }) => `still thinking about it?`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        I noticed you haven't started a plan for ${businessName} yet. That's fine — just didn't want the report to get buried.
      </p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        If the price is the thing, Starter is $39.99 for the first month with code <strong>INTRO50</strong>. That's less than most businesses spend on a single Google Ads click.
      </p>
      <p style="color:#52525b;font-size:15px;margin:0 0 16px 0">
        If you're not sure it'll work for your type of business — just reply and tell me what ${businessName} does. I'll give you an honest answer.
      </p>
      ${btn(`${siteUrl}/scan?plan=starter`, "Start for $39.99 — code INTRO50")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">No pressure. Your free report is still at: <a href="${reportUrl}" style="color:#dc2626">${reportUrl}</a></p>
    `, email, leadId),
  },
  {
    day: 8,
    subject: ({ businessName }) => `What ${businessName}'s Google listing looks like to customers right now`,
    html: ({ name, businessName, score, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Visibility Check</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Your listing right now vs. 30 days from now</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        ${score !== null ? `${businessName} scored ${score}/100 on local visibility when you scanned.` : `Your scan found gaps in ${businessName}'s local visibility.`}
        Here is what changes after one month on GravyBlock:
      </p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <div style="display:flex;gap:16px">
          <div style="flex:1">
            <p style="margin:0;font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase">Today</p>
            <ul style="margin:8px 0 0;padding-left:18px;color:#71717a;font-size:13px;line-height:1.9">
              <li>Static listing, no new content</li>
              <li>Citation inconsistencies unfixed</li>
              <li>Reviews going unanswered</li>
              <li>Not appearing in AI search</li>
            </ul>
          </div>
          <div style="flex:1">
            <p style="margin:0;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase">30 Days In</p>
            <ul style="margin:8px 0 0;padding-left:18px;color:#3f3f46;font-size:13px;line-height:1.9">
              <li>2–4 local articles published</li>
              <li>Citation gaps surfaced and fixed</li>
              <li>AI reply drafts for every review</li>
              <li>AI citation monitor tracking you</li>
            </ul>
          </div>
        </div>
      </div>
      ${btn(`${siteUrl}/scan?plan=starter`, "Start for $39.99 — code INTRO50")}
    `, email, leadId),
  },
  {
    day: 9,
    subject: ({ businessName }) => `3 things ${businessName} can fix on Google right now (free)`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">Free Tips</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">3 quick wins — no tool required</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">Whether or not you ever use GravyBlock, here are three things that move the needle for almost every local business:</p>
      <div style="margin:16px 0;padding:16px;background:#f4f4f5;border-radius:12px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">1. Reply to every Google review — even old ones</p>
        <p style="margin:6px 0 16px;font-size:13px;color:#52525b">Google's algorithm rewards engagement. Replying to reviews (5-star and 1-star) signals an active business. Most owners ignore this completely.</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">2. Make sure your business name, address, and phone match everywhere</p>
        <p style="margin:6px 0 16px;font-size:13px;color:#52525b">Check Google, Yelp, Facebook, and your website. If the info is inconsistent, Google lowers your local rank. This is one of the most common and easily fixed issues.</p>
        <p style="margin:0;font-size:14px;font-weight:700;color:#18181b">3. Add a "services" section to your Google Business Profile</p>
        <p style="margin:6px 0 0;font-size:13px;color:#52525b">Most profiles skip this. Adding your specific services (not just your category) helps Google match you to more searches.</p>
      </div>
      <p style="color:#52525b;font-size:14px;margin:12px 0">GravyBlock monitors and automates all three of these for ${businessName} — but if you want to do it manually first, start there.</p>
      ${btn(`${reportUrl}`, "See the full report for ${businessName}".replace("${businessName}", businessName))}
    `, email, leadId),
  },
  {
    day: 10,
    subject: ({ businessName, vertical }) => `How other ${vertical ? vertical.toLowerCase() + "s" : "local businesses"} use GravyBlock`,
    html: ({ name, businessName, vertical, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">How It Works in Practice</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">The first 30 days, step by step</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        Here is exactly what happens when ${businessName} goes live on GravyBlock — no login required after setup:
      </p>
      <ol style="margin:12px 0;padding-left:22px;color:#3f3f46;font-size:14px;line-height:2.2">
        <li>GravyBlock scans your Google listing, website, and competitors and scores all visibility signals.</li>
        <li>It writes the first ${vertical ? vertical.toLowerCase() : "local"} article targeting your city and queues it for your site.</li>
        <li>A citation audit checks your business name, address, and phone across 40+ directories and surfaces inconsistencies.</li>
        <li>New reviews get an AI-drafted reply suggested in your inbox. You copy and post in 10 seconds.</li>
        <li>Every week, the visibility score refreshes and a new content piece queues. Every month, you get a digest showing exactly what ran.</li>
      </ol>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        None of this requires you to learn SEO. It just runs.
      </p>
      ${btn(`${siteUrl}/scan?plan=growth`, `Start autopilot for ${businessName}`)}
      <p style="color:#71717a;font-size:13px;margin:12px 0">Use code <strong>INTRO50</strong> at checkout — 50% off your first month.</p>
    `),
  },
  {
    day: 14,
    subject: ({ businessName }) => `${businessName}: the INTRO50 code expires soon`,
    html: ({ name, businessName, reportUrl, email, leadId }) => wrap(`
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#dc2626">Offer Expiring</p>
      <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Last chance at 50% off</h1>
      <p style="color:#52525b;font-size:15px;margin:16px 0">Hi ${name},</p>
      <p style="color:#52525b;font-size:14px;margin:12px 0">
        The <strong>INTRO50</strong> promo code — 50% off your first month — is valid for new signups from scan leads. It will not last indefinitely, and this is the last time I will mention it.
      </p>
      <div style="margin:20px 0;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px">
        <p style="margin:0;font-size:15px;font-weight:700;color:#991b1b">Starter — $39.99 first month (was $79.99)</p>
        <p style="margin:6px 0 0;font-size:13px;color:#3f3f46">Monthly visibility monitoring, citation audit, review queue, content ideas, and a full workspace for ${businessName}. No contract.</p>
      </div>
      <div style="margin:12px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px">
        <p style="margin:0;font-size:15px;font-weight:700;color:#166534">Scale — $74.99 first month (was $149.99)</p>
        <p style="margin:6px 0 0;font-size:13px;color:#3f3f46">Everything in Starter plus weekly AI articles published to your site, Reddit outreach, backlink prospecting, and AI citation monitoring. Fully automated.</p>
      </div>
      ${btn(`${siteUrl}/scan?plan=starter`, "Claim 50% off — use code INTRO50")}
      <p style="color:#71717a;font-size:13px;margin:16px 0">
        After this email, GravyBlock will not contact you again unless you run a new scan. Your report for ${businessName} stays available at the link below.
      </p>
      <p style="margin:8px 0;font-size:13px"><a href="${reportUrl}" style="color:#dc2626">${reportUrl}</a></p>
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
