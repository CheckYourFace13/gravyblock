import type { Prospect } from "./prospect-finder";

type SendEmailResult = { ok: boolean; skipped?: boolean; reason?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
const SENDER_NAME = "Chris";
const SENDER_TITLE = "GravyBlock";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? `${SENDER_NAME} at GravyBlock <hello@gravyblock.com>`,
  };
}

function buildScanUrl(prospect: Prospect): string {
  // Pre-fill the scan page with their business name + city so they land on results fast
  const params = new URLSearchParams({
    q: prospect.businessName,
    city: prospect.city,
  });
  return `${SITE_URL}/scan?${params.toString()}`;
}

function buildSubjectLine(prospect: Prospect): string {
  const { businessName, rating, reviewCount, city } = prospect;
  // Specific, observation-based subjects — avoid anything that sounds like mass email
  if (reviewCount !== undefined && reviewCount < 10) {
    return `${businessName} — not showing up in the ${city} top 3`;
  }
  if (reviewCount !== undefined && reviewCount < 25) {
    return `${businessName} — competitors have 3x more reviews`;
  }
  if (rating !== undefined && rating < 4.0) {
    return `saw ${businessName} on Google Maps — quick note`;
  }
  if (rating !== undefined && rating >= 4.5) {
    return `${businessName} has great reviews — here's what's still holding it back`;
  }
  return `${businessName} — missing from the ${city} top 3`;
}

function buildTextEmail(prospect: Prospect, industryLabel: string): string {
  const { businessName, city, rating, reviewCount, weaknessReasons } = prospect;
  const scanUrl = buildScanUrl(prospect);

  const reviewStr =
    reviewCount === undefined || reviewCount === 0
      ? "no Google reviews yet"
      : `${reviewCount} Google review${reviewCount === 1 ? "" : "s"}`;

  const ratingStr = rating !== undefined ? `${rating} stars` : "no rating yet";

  const primaryGap = weaknessReasons[0] ?? "gaps in local SEO visibility";

  return `Hi,

I was looking at ${industryLabel}s in ${city} on Google Maps and came across ${businessName}.

You have ${reviewStr} and a ${ratingStr} average. That puts you behind most of the businesses ranking in the top 3 for your category — and those top 3 spots capture 70%+ of all the clicks.

The main thing I noticed: ${primaryGap}.

I built a free tool called GravyBlock that shows you exactly where you stand and what to fix. It runs in 60 seconds and gives you a prioritized list — no account needed.

Here's your free score: ${scanUrl}

If you want, GravyBlock can also handle the fixes automatically — weekly content, review monitoring, citation cleanup, backlink outreach. Most of our customers replace their local SEO agency for under $100/mo.

Either way, the scan is free and takes a minute.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com

P.S. — I send these personally when I notice a business that could be ranking higher. No CRM blast, no unsubscribe needed — just reply and I'll stop.`;
}

function buildHtmlEmail(prospect: Prospect, industryLabel: string): string {
  const { businessName, city, rating, reviewCount, weaknessReasons } = prospect;
  const scanUrl = buildScanUrl(prospect);

  const reviewStr =
    reviewCount === undefined || reviewCount === 0
      ? "no Google reviews yet"
      : `${reviewCount} Google review${reviewCount === 1 ? "" : "s"}`;

  const ratingStr = rating !== undefined ? `${rating} stars` : "no rating yet";
  const primaryGap = weaknessReasons[0] ?? "gaps in local SEO visibility";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  <p style="margin:0 0 18px">
    I was looking at ${industryLabel}s in <strong>${city}</strong> on Google Maps and came across <strong>${businessName}</strong>.
  </p>

  <p style="margin:0 0 18px">
    You have <strong>${reviewStr}</strong> and a <strong>${ratingStr}</strong> average.
    That puts you behind most of the businesses ranking in the top&nbsp;3 for your category —
    and those top&nbsp;3 spots capture <strong>70%+ of all the clicks</strong>.
  </p>

  <p style="margin:0 0 18px">
    The main thing I noticed: <strong>${primaryGap}</strong>.
  </p>

  <p style="margin:0 0 18px">
    I built a free tool called <strong>GravyBlock</strong> that shows you exactly where you stand
    and what to fix. It runs in 60&nbsp;seconds and gives you a prioritized action list —
    no account needed.
  </p>

  <p style="margin:0 0 24px;text-align:center">
    <a href="${scanUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See your free score →
    </a>
    <br/>
    <span style="font-size:12px;color:#666;margin-top:6px;display:block">${scanUrl}</span>
  </p>

  <p style="margin:0 0 18px;font-size:14px;color:#555">
    If you want, GravyBlock can also handle the fixes automatically — weekly content,
    review monitoring, citation cleanup, and backlink outreach.
    Most customers replace their local SEO agency for under <strong>$100/mo</strong>.
  </p>

  <p style="margin:0 0 32px;font-size:14px;color:#555">
    Either way, the scan is free and takes a minute.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  <p style="font-size:12px;color:#999;margin:0">
    I send these personally when I notice a business that could be ranking higher.
    No CRM blast, no unsubscribe link needed — just reply and I'll stop.
  </p>

</body>
</html>`;
}

/** Derives multiple candidate email addresses from a domain to try in order. */
function deriveEmailCandidates(website: string): string[] {
  try {
    const domain = new URL(website).hostname.replace(/^www\./, "");
    return [`info@${domain}`, `hello@${domain}`, `contact@${domain}`];
  } catch {
    return [];
  }
}

export async function sendProspectEmail(
  prospect: Prospect,
  senderContext?: { agencyName?: string; industryLabel?: string },
): Promise<SendEmailResult> {
  const cfg = resendConfig();

  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  if (!prospect.website) return { ok: false, skipped: true, reason: "no website — cannot derive email" };

  const candidates = deriveEmailCandidates(prospect.website);
  if (candidates.length === 0) return { ok: false, skipped: true, reason: "could not parse website domain" };

  const toEmail = candidates[0]!; // send to primary; others are fallback for future retry logic
  const industryLabel = senderContext?.industryLabel ?? "local business";

  const subject = buildSubjectLine(prospect);
  const text = buildTextEmail(prospect, industryLabel);
  const html = buildHtmlEmail(prospect, industryLabel);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [toEmail],
      subject,
      html,
      text,
      tags: [
        { name: "type", value: "cold_outreach" },
        { name: "city", value: prospect.city.toLowerCase().replace(/\s+/g, "_") },
        { name: "industry", value: industryLabel.toLowerCase().replace(/\s+/g, "_") },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  return { ok: true };
}
