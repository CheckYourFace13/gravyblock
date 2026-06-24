import type { Prospect } from "./prospect-finder";
import { isOptedOut, coldOutreachFooter } from "@/lib/email/optout";

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

function buildScanUrl(prospect: Prospect & { emailTo?: string }): string {
  // Pre-fill the scan page with their business name + city so they land on results fast.
  // Include their email (base64url) so the scan auto-captures them as a lead — we
  // already know it, no reason to make them type it again.
  const params = new URLSearchParams({
    q: prospect.businessName,
    city: prospect.city,
  });
  if (prospect.emailTo) {
    params.set("e", Buffer.from(prospect.emailTo.toLowerCase()).toString("base64url"));
  }
  return `${SITE_URL}/scan?${params.toString()}`;
}

function buildSubjectLine(prospect: Prospect): string {
  const { businessName, city } = prospect;
  // Subjects must be TRUE for any recipient (we email 5-star businesses too).
  // No unverifiable claims like "competitors have 3x more reviews" — those read
  // as spam and destroy credibility the moment they're wrong. Curiosity + specific.
  const options = [
    `Does ChatGPT recommend ${businessName}?`,
    `quick question about ${businessName} & Google`,
    `${businessName} — found something on your Google listing`,
    `is ${businessName} showing up in AI search?`,
  ];
  // Deterministic pick from the business name so the same business always gets
  // the same subject (no flip-flop on retries), but variety across the list.
  const idx = businessName.length % options.length;
  return options[idx]!;
}

function buildTextEmail(prospect: Prospect, industryLabel: string): string {
  const { businessName, city, reviewCount } = prospect;
  const scanUrl = buildScanUrl(prospect);

  const reviewStr =
    reviewCount === undefined || reviewCount === 0
      ? "no Google reviews yet"
      : `${reviewCount} Google review${reviewCount === 1 ? "" : "s"}`;

  // Honest, specific line about reviews only when it's genuinely a weakness.
  // For strong businesses we skip it rather than invent a problem.
  const reviewLine =
    reviewCount !== undefined && reviewCount < 25
      ? `You're at ${reviewStr}, which is below what it usually takes to hold a top-3 spot in ${city} — but that's fixable, and it's not even the main thing.\n\n`
      : "";

  return `Hi,

I run a tool that checks how local businesses show up on Google and in AI search (ChatGPT, Perplexity, Google's AI answers), and I ran ${businessName} through it.

${reviewLine}Here's the part most ${industryLabel}s don't realize: when someone in ${city} asks an AI assistant "who's the best ${industryLabel}?", it names specific businesses now. Most ${industryLabel}s I check aren't mentioned at all. If that's you, you're invisible to a fast-growing slice of your customers.

Rather than guess, I'd rather just show you. Free 60-second report, no account needed:

${scanUrl}

It scores your Google profile, reviews, and whether AI actually recommends you in ${city}.

If it's useful and you'd want it handled automatically (content, reviews, citations, all of it), GravyBlock does that from under $100/mo. But the report's free either way.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com

P.S. I send these by hand when I spot a ${city} business that could rank higher. Reply "no thanks" and you won't hear from me again.`;
}

function buildHtmlEmail(prospect: Prospect & { emailTo?: string }, industryLabel: string): string {
  const { businessName, city, reviewCount, emailTo = "" } = prospect;
  const scanUrl = buildScanUrl(prospect);

  const reviewStr =
    reviewCount === undefined || reviewCount === 0
      ? "no Google reviews yet"
      : `${reviewCount} Google review${reviewCount === 1 ? "" : "s"}`;

  const reviewLine =
    reviewCount !== undefined && reviewCount < 25
      ? `<p style="margin:0 0 18px">You're at <strong>${reviewStr}</strong>, which is below what it usually takes to hold a top-3 spot in ${city}. That's fixable, and it's not even the main thing.</p>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  <p style="margin:0 0 18px">
    I run a tool that checks how local businesses show up on Google and in AI search
    (ChatGPT, Perplexity, Google's AI answers), and I ran <strong>${businessName}</strong> through it.
  </p>

  ${reviewLine}

  <p style="margin:0 0 18px">
    Here's the part most ${industryLabel}s don't realize: when someone in <strong>${city}</strong>
    asks an AI assistant &ldquo;who's the best ${industryLabel}?&rdquo;, it names specific businesses now.
    Most ${industryLabel}s I check aren't mentioned at all. If that's you, you're invisible to a
    fast-growing slice of your customers.
  </p>

  <p style="margin:0 0 18px">
    Rather than guess, I'd rather just show you. Free 60-second report, no account needed:
  </p>

  <p style="margin:0 0 24px;text-align:center">
    <a href="${scanUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See my free report →
    </a>
    <br/>
    <span style="font-size:12px;color:#666;margin-top:6px;display:block">${scanUrl}</span>
  </p>

  <p style="margin:0 0 18px;font-size:14px;color:#555">
    It scores your Google profile, reviews, and whether AI actually recommends you in ${city}.
    If you'd want it all handled automatically (content, reviews, citations), GravyBlock does that
    from under <strong>$100/mo</strong> — but the report's free either way.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>

  <p style="margin:8px 0 0;font-size:13px;color:#888">
    P.S. I send these by hand when I spot a ${city} business that could rank higher.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  ${coldOutreachFooter(emailTo)}

</body>
</html>`;
}

// ── Follow-up email (email #2 — free trial offer) ───────────────────────────

function buildFollowupSubject(businessName: string): string {
  return `${businessName} — one more note (+ a free month)`;
}

function buildFollowupText(businessName: string, scanUrl: string): string {
  return `Hi,

I reached out last week about ${businessName}'s local search rankings and wanted to follow up once.

I know you're busy, so I'll make this quick: GravyBlock is running a trial where we give new customers their first month completely free — no credit card charge, cancel any time.

Here's what happens during that month:
- We generate SEO content for your website automatically every week
- We clean up your Google Business Profile (Q&As, services, photos)
- We find and fix citation issues that hurt your local rankings
- We track where you rank vs. competitors

Local rankings move when content, citations, and reviews stay consistent — that's exactly what GravyBlock runs for you every week. After the free month it's $79.99/mo, less than most SEO agencies charge for a single hour.

Run your free visibility score first (takes 60 seconds):
${scanUrl}

Then use code EMAILFREE at checkout for your first month free.

If the timing isn't right, I completely understand — I won't follow up again after this.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com`;
}

function buildFollowupHtml(businessName: string, scanUrl: string, emailTo: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  <p style="margin:0 0 18px">
    I reached out last week about <strong>${businessName}</strong>'s local search rankings — wanted to follow up once before I move on.
  </p>

  <p style="margin:0 0 18px">
    I'll make this quick: GravyBlock is offering new customers their <strong>first month completely free</strong> — no charge, cancel any time.
  </p>

  <p style="margin:0 0 6px;font-weight:600;color:#1a1a1a">Here's what happens during that free month:</p>
  <ul style="margin:0 0 18px;padding-left:20px;color:#333">
    <li style="margin-bottom:6px">Weekly SEO content published for your business automatically</li>
    <li style="margin-bottom:6px">Google Business Profile cleanup — Q&amp;As, services, photos</li>
    <li style="margin-bottom:6px">Citation fixes that directly affect your local rankings</li>
    <li style="margin-bottom:6px">Competitor tracking so you can see exactly where you stand</li>
  </ul>

  <p style="margin:0 0 18px;font-size:14px;color:#555">
    Local rankings move when content, citations, and reviews stay consistent — that's exactly
    what GravyBlock runs for you every week. After the free month it's $79.99/mo,
    less than most agencies charge for a single hour.
  </p>

  <p style="margin:0 0 8px">Start with your free visibility score (60 seconds):</p>

  <p style="margin:0 0 24px;text-align:center">
    <a href="${scanUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See your free score →
    </a>
    <br/>
    <span style="font-size:12px;color:#666;margin-top:6px;display:block">Then use code <strong>EMAILFREE</strong> at checkout for your first month free</span>
  </p>

  <p style="margin:0 0 32px;font-size:14px;color:#555">
    If the timing isn't right, I completely understand — I won't follow up again after this.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  ${coldOutreachFooter(emailTo)}

</body>
</html>`;
}

export async function sendFollowupEmail(params: {
  businessName: string;
  email: string;
  city?: string;
}): Promise<SendEmailResult> {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };

  if (await isOptedOut(params.email)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  const scanUrlParams = new URLSearchParams({ q: params.businessName, ...(params.city ? { city: params.city } : {}) });
  scanUrlParams.set("e", Buffer.from(params.email.toLowerCase()).toString("base64url"));
  scanUrlParams.set("promo", "EMAILFREE");
  const scanUrl = `${SITE_URL}/scan?${scanUrlParams.toString()}`;

  const subject = buildFollowupSubject(params.businessName);
  const text = buildFollowupText(params.businessName, scanUrl);
  const html = buildFollowupHtml(params.businessName, scanUrl, params.email);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [params.email],
      subject,
      html,
      text,
      tags: [
        { name: "type", value: "cold_outreach_followup" },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  return { ok: true };
}

// ── Breakup email (email #3 — final touch, highest reply rate) ──────────────

export async function sendBreakupEmail(params: {
  businessName: string;
  email: string;
  city?: string;
}): Promise<SendEmailResult> {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };

  if (await isOptedOut(params.email)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  const scanUrlParams = new URLSearchParams({ q: params.businessName, ...(params.city ? { city: params.city } : {}) });
  scanUrlParams.set("e", Buffer.from(params.email.toLowerCase()).toString("base64url"));
  scanUrlParams.set("promo", "EMAILFREE");
  const scanUrl = `${SITE_URL}/scan?${scanUrlParams.toString()}`;

  const subject = `${params.businessName} — closing your file`;

  const text = `Hi,

I've reached out a couple of times about ${params.businessName}'s Google visibility and haven't heard back — totally understand, you're running a business.

This is my last email. I'll close your file after this.

Before I do: the free month offer (code EMAILFREE) is still active if you ever want to see what automated local SEO looks like. The scan takes 60 seconds and the first month costs nothing:

${scanUrl}

If now's not the time, no hard feelings — I hope business is booming.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">
  <p style="margin:0 0 18px">Hi,</p>
  <p style="margin:0 0 18px">
    I've reached out a couple of times about <strong>${params.businessName}</strong>'s Google visibility and haven't heard back — totally understand, you're running a business.
  </p>
  <p style="margin:0 0 18px"><strong>This is my last email.</strong> I'll close your file after this.</p>
  <p style="margin:0 0 18px">
    Before I do: the free month offer (code <strong>EMAILFREE</strong>) is still active if you ever want to see what automated local SEO looks like. The scan takes 60 seconds and the first month costs nothing.
  </p>
  <p style="margin:0 0 24px;text-align:center">
    <a href="${scanUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      Run my free scan →
    </a>
  </p>
  <p style="margin:0 0 32px;font-size:14px;color:#555">If now's not the time, no hard feelings — I hope business is booming.</p>
  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>
  ${coldOutreachFooter(params.email)}
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [params.email],
      subject,
      html,
      text,
      tags: [{ name: "type", value: "cold_outreach_breakup" }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  return { ok: true };
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

  // Skip opted-out addresses
  if (await isOptedOut(toEmail)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  // Attach the recipient email to the prospect so the HTML footer can build the unsubscribe link
  (prospect as Prospect & { emailTo?: string }).emailTo = toEmail;

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
