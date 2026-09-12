import type { Prospect } from "./prospect-finder";
import type { ProspectPreScan } from "./prospect-prescan";
import { isOptedOut, coldOutreachFooter } from "@/lib/email/optout";
import { assertOutreachSendingAllowed } from "./pause-guard";
import { classifyFindingStrength, naturalFindingPhrase, findingSubjectPhrase } from "./finding-quality";

type SendEmailResult = { ok: boolean; skipped?: boolean; reason?: string; resendEmailId?: string | null };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
const SENDER_NAME = "Chris";
const SENDER_TITLE = "GravyBlock";

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    // Cold outreach sends from OUTREACH_FROM_EMAIL when set — a separate
    // sending domain so bounce/spam reputation from cold email never touches
    // gravyblock.com, which transactional mail (receipts, login links,
    // reports) depends on. Links in the emails still point at gravyblock.com.
    // Falls back to the main from-address until the outreach domain exists.
    from:
      process.env.OUTREACH_FROM_EMAIL ??
      process.env.RESEND_FROM_EMAIL ??
      `${SENDER_NAME} at GravyBlock <hello@gravyblock.com>`,
  };
}

function buildScanUrl(prospect: Prospect & { emailTo?: string }, attributionToken?: string | null): string {
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
  if (attributionToken) params.set("src", attributionToken);
  return `${SITE_URL}/scan?${params.toString()}`;
}

/** Appends the first-party attribution token to a report/scan URL — never PII, just an opaque per-send id. */
function withAttribution(url: string, token?: string | null): string {
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}src=${encodeURIComponent(token)}`;
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

If it's useful and you'd want it handled automatically (content, reviews, citations, all of it), GravyBlock starts at $29.99/mo right now with code INTRO50 — the lowest we've ever priced it, and it won't stay this low. But the report's free either way.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com

P.S. My tool flagged ${businessName} because the listing has room to rank higher in ${city}. Reply "no thanks" and you won't hear from me again.`;
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
    If you'd want it all handled automatically (content, reviews, citations), GravyBlock starts at
    <strong>$29.99/mo</strong> right now with code INTRO50 — the lowest we've ever priced it, and it
    won't stay this low. But the report's free either way.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>

  <p style="margin:8px 0 0;font-size:13px;color:#888">
    P.S. My tool flagged ${businessName} because the listing has room to rank higher in ${city}.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  ${coldOutreachFooter(emailTo)}

</body>
</html>`;
}

// ── Report-variant email #1: we already ran their scan ──────────────────────
// Sent when a pre-scan succeeded. "Your business scored 54/100, here's why,
// full report at this link" converts far better than asking a stranger to go
// run a scan themselves — the work is already done and the number is real.

type InitialVariant = "A" | "B";

function buildReportSubject(prospect: Prospect, preScan: ProspectPreScan, variant: InitialVariant = "A"): string {
  if (variant === "B") {
    const topFinding = preScan.topFixes[0];
    const strength = classifyFindingStrength(topFinding?.id);
    // Only a genuinely strong, specific finding earns a dedicated subject —
    // otherwise lead with the neutral business-name subject rather than
    // inventing drama out of a softer finding.
    const specificSubject = strength === "strong" ? findingSubjectPhrase(topFinding?.id) : null;
    return specificSubject ?? `Quick question about ${prospect.businessName}`;
  }
  return `${prospect.businessName} scored ${preScan.score}/100 on Google visibility`;
}

function buildReportText(prospect: Prospect, preScan: ProspectPreScan, variant: InitialVariant = "A"): string {
  const { businessName, city } = prospect;
  const topFinding = preScan.topFixes[0];

  if (variant === "B") {
    // Short, plain, human — the goal of email #1 is to get the report
    // clicked, not to sell the subscription. One real finding, no jargon,
    // no feature list, no score, no price.
    const naturalIssue = topFinding ? naturalFindingPhrase(topFinding.id) ?? topFinding.title.toLowerCase() : null;
    const noticedLine = naturalIssue
      ? `I was looking at ${businessName} and noticed ${naturalIssue}.`
      : `I was looking at ${businessName}'s Google presence and wanted to check a few things.`;

    return `Hi,

${noticedLine}

I ran a quick visibility check because of it. I put the results here if you want to see them:
${preScan.reportUrl}

No signup needed.

${SENDER_NAME}
${SENDER_TITLE}

P.S. If you'd rather I not email again, just reply no thanks.`;
  }

  // Variant A — existing score-led control.
  const openingLine = topFinding
    ? `${topFinding.title} — that's the main thing holding ${businessName} back on Google in ${city} right now (scored ${preScan.score}/100).`
    : `${businessName} actually scored well — ${preScan.score}/100 in ${city}. The report below shows where the remaining headroom is.`;

  return `Hi,

${openingLine}

Full breakdown here — score, verdict, and what's fixable, no signup:
${preScan.reportUrl}

If you'd rather have it handled than do it yourself, that's what GravyBlock runs automatically. Just reply and I'll get you set up, or check the report for details.

${SENDER_NAME}
${SENDER_TITLE} — https://gravyblock.com

P.S. Reply "no thanks" and you won't hear from me again.`;
}

function buildReportHtml(
  prospect: Prospect & { emailTo?: string },
  preScan: ProspectPreScan,
  variant: InitialVariant = "A",
): string {
  const { businessName, city, emailTo = "" } = prospect;
  const topFinding = preScan.topFixes[0];

  if (variant === "B") {
    const naturalIssue = topFinding ? naturalFindingPhrase(topFinding.id) ?? topFinding.title.toLowerCase() : null;
    const noticedLine = naturalIssue
      ? `I was looking at <strong>${businessName}</strong> and noticed ${naturalIssue}.`
      : `I was looking at <strong>${businessName}</strong>'s Google presence and wanted to check a few things.`;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  <p style="margin:0 0 18px">${noticedLine}</p>

  <p style="margin:0 0 18px">I ran a quick visibility check because of it. I put the results here if you want to see them:</p>

  <p style="margin:0 0 24px;text-align:center">
    <a href="${preScan.reportUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See the results →
    </a>
  </p>

  <p style="margin:0 0 18px;font-size:14px;color:#555">No signup needed.</p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    ${SENDER_TITLE}
  </p>

  <p style="margin:8px 0 0;font-size:13px;color:#888">
    P.S. If you'd rather I not email again, just reply no thanks.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  ${coldOutreachFooter(emailTo)}

</body>
</html>`;
  }

  // Variant A — existing score-led control.
  const openingBlock = topFinding
    ? `<p style="margin:0 0 18px">
        <strong>${topFinding.title}</strong> — that's the main thing holding <strong>${businessName}</strong> back on Google
        in ${city} right now (scored <strong>${preScan.score}/100</strong>).
      </p>`
    : `<p style="margin:0 0 18px"><strong>${businessName}</strong> actually scored well — <strong>${preScan.score}/100</strong> in ${city}. The report below shows where the remaining headroom is.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  ${openingBlock}

  <p style="margin:0 0 24px;text-align:center">
    <a href="${preScan.reportUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See the full report →
    </a>
    <br/>
    <span style="font-size:12px;color:#666;margin-top:6px;display:block">Score, verdict, and what's fixable — no signup. ${preScan.reportUrl}</span>
  </p>

  <p style="margin:0 0 18px;font-size:14px;color:#555">
    If you'd rather have it handled than do it yourself, that's what GravyBlock runs automatically. Just reply and I'll get you set up, or check the report for details.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}<br/>
    <a href="https://gravyblock.com" style="color:#dc2626;text-decoration:none">${SENDER_TITLE}</a>
  </p>

  <p style="margin:8px 0 0;font-size:13px;color:#888">
    P.S. Reply &ldquo;no thanks&rdquo; and you won't hear from me again.
  </p>

  <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

  ${coldOutreachFooter(emailTo)}

</body>
</html>`;
}

// ── Follow-up email (email #2 — free trial offer) ───────────────────────────

function buildFollowupSubject(businessName: string): string {
  return `Following up — ${businessName}`;
}

function buildFollowupText(businessName: string, linkUrl: string, findingId: string | null): string {
  const findingPhrase = naturalFindingPhrase(findingId);
  const reminderLine = findingPhrase
    ? `Just following up on the note I sent about ${businessName} — specifically, ${findingPhrase}.`
    : `Just following up on the note I sent about ${businessName}.`;

  return `Hi,

${reminderLine}

Your report is here:
${linkUrl}

If you'd rather have GravyBlock handle the ongoing work, Autopilot is currently $74.99/month, locked while you remain subscribed. There's a 30-day money-back guarantee and you can cancel anytime.

If you want, reply here and I'll help you get it running.

${SENDER_NAME}`;
}

function buildFollowupHtml(businessName: string, linkUrl: string, findingId: string | null, emailTo: string): string {
  const findingPhrase = naturalFindingPhrase(findingId);
  const reminderLine = findingPhrase
    ? `Just following up on the note I sent about <strong>${businessName}</strong> — specifically, ${findingPhrase}.`
    : `Just following up on the note I sent about <strong>${businessName}</strong>.`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">

  <p style="margin:0 0 18px">Hi,</p>

  <p style="margin:0 0 18px">${reminderLine}</p>

  <p style="margin:0 0 8px">Your report is here:</p>
  <p style="margin:0 0 24px;text-align:center">
    <a href="${linkUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See the report →
    </a>
  </p>

  <p style="margin:0 0 18px">
    If you'd rather have GravyBlock handle the ongoing work, Autopilot is currently <strong>$74.99/month</strong>, locked while you remain subscribed. There's a 30-day money-back guarantee and you can cancel anytime.
  </p>

  <p style="margin:0 0 32px;font-size:14px;color:#555">
    If you want, reply here and I'll help you get it running.
  </p>

  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}
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
  attributionToken?: string | null;
  reportPublicId?: string | null;
  findingId?: string | null;
}): Promise<SendEmailResult> {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };

  if (await isOptedOut(params.email)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  // Authoritative pause check, right at the send boundary — see pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(params.email);
  if (!pauseCheck.allowed) {
    return { ok: false, skipped: true, reason: pauseCheck.reason };
  }

  // Prefer linking back to the SAME personalized report already run for this
  // business — never make a prospect re-run a scan GravyBlock already did.
  // Falls back to the scan flow only when no report exists yet (older
  // candidates, or a fallback-path initial send with no pre-scan).
  let linkUrl: string;
  if (params.reportPublicId) {
    linkUrl = withAttribution(`${SITE_URL}/report/${params.reportPublicId}`, params.attributionToken);
  } else {
    const scanUrlParams = new URLSearchParams({ q: params.businessName, ...(params.city ? { city: params.city } : {}) });
    scanUrlParams.set("e", Buffer.from(params.email.toLowerCase()).toString("base64url"));
    scanUrlParams.set("promo", "GROWTH50");
    if (params.attributionToken) scanUrlParams.set("src", params.attributionToken);
    linkUrl = `${SITE_URL}/scan?${scanUrlParams.toString()}`;
  }

  const findingId = params.findingId ?? null;
  const subject = buildFollowupSubject(params.businessName);
  const text = buildFollowupText(params.businessName, linkUrl, findingId);
  const html = buildFollowupHtml(params.businessName, linkUrl, findingId, params.email);

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

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, resendEmailId: body?.id ?? null };
}

// ── Breakup email (email #3 — final touch, highest reply rate) ──────────────

export async function sendBreakupEmail(params: {
  businessName: string;
  email: string;
  city?: string;
  attributionToken?: string | null;
  reportPublicId?: string | null;
}): Promise<SendEmailResult> {
  const cfg = resendConfig();
  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };

  if (await isOptedOut(params.email)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  // Authoritative pause check, right at the send boundary — see pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(params.email);
  if (!pauseCheck.allowed) {
    return { ok: false, skipped: true, reason: pauseCheck.reason };
  }

  let linkUrl: string;
  if (params.reportPublicId) {
    linkUrl = withAttribution(`${SITE_URL}/report/${params.reportPublicId}`, params.attributionToken);
  } else {
    const scanUrlParams = new URLSearchParams({ q: params.businessName, ...(params.city ? { city: params.city } : {}) });
    scanUrlParams.set("e", Buffer.from(params.email.toLowerCase()).toString("base64url"));
    scanUrlParams.set("promo", "GROWTH50");
    if (params.attributionToken) scanUrlParams.set("src", params.attributionToken);
    linkUrl = `${SITE_URL}/scan?${scanUrlParams.toString()}`;
  }

  const subject = `Last note about ${params.businessName}`;

  const text = `Hi,

Last note from me — I wanted to make sure you had the visibility report I ran for ${params.businessName}:
${linkUrl}

Autopilot is $74.99/month, locked while subscribed, with a 30-day guarantee.

If you'd like help getting it running, just reply.

${SENDER_NAME}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#1a1a1a;max-width:560px;margin:0 auto;padding:32px 20px;background:#fff">
  <p style="margin:0 0 18px">Hi,</p>
  <p style="margin:0 0 18px">Last note from me — I wanted to make sure you had the visibility report I ran for <strong>${params.businessName}</strong>:</p>
  <p style="margin:0 0 24px;text-align:center">
    <a href="${linkUrl}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">
      See the report →
    </a>
  </p>
  <p style="margin:0 0 18px">Autopilot is <strong>$74.99/month</strong>, locked while subscribed, with a 30-day guarantee.</p>
  <p style="margin:0 0 32px;font-size:14px;color:#555">If you'd like help getting it running, just reply.</p>
  <p style="margin:0 0 6px;font-size:14px">
    ${SENDER_NAME}
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

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, resendEmailId: body?.id ?? null };
}

export async function sendProspectEmail(
  prospect: Prospect,
  toEmail: string,
  senderContext?: { agencyName?: string; industryLabel?: string; preScan?: ProspectPreScan | null; attributionToken?: string | null; variant?: InitialVariant },
): Promise<SendEmailResult> {
  const cfg = resendConfig();

  if (!cfg.apiKey) return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  if (!toEmail) return { ok: false, skipped: true, reason: "no recipient email" };

  // Skip opted-out addresses
  if (await isOptedOut(toEmail)) {
    return { ok: false, skipped: true, reason: "opted out" };
  }

  // Authoritative pause check, right at the send boundary — see pause-guard.ts.
  const pauseCheck = await assertOutreachSendingAllowed(toEmail);
  if (!pauseCheck.allowed) {
    return { ok: false, skipped: true, reason: pauseCheck.reason };
  }

  // Attach the recipient email to the prospect so the HTML footer can build the unsubscribe link
  (prospect as Prospect & { emailTo?: string }).emailTo = toEmail;

  const industryLabel = senderContext?.industryLabel ?? "local business";
  const rawPreScan = senderContext?.preScan ?? null;
  const attributionToken = senderContext?.attributionToken ?? null;
  // Attach attribution to the report link itself, not just the fallback scan
  // link, since the report variant is the one actually sent (see
  // run-outreach-batch.ts — it skips rather than falling back when pre-scan
  // fails, so the plain buildScanUrl path below is effectively unused today).
  const preScan = rawPreScan ? { ...rawPreScan, reportUrl: withAttribution(rawPreScan.reportUrl, attributionToken) } : null;
  const variant = senderContext?.variant ?? "A";

  // Report variant when we pre-ran their scan; invite variant as fallback
  const subject = preScan ? buildReportSubject(prospect, preScan, variant) : buildSubjectLine(prospect);
  const text = preScan ? buildReportText(prospect, preScan, variant) : buildTextEmail(prospect, industryLabel);
  const html = preScan ? buildReportHtml(prospect, preScan, variant) : buildHtmlEmail(prospect, industryLabel);

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
        { name: "variant", value: variant },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  const body = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, resendEmailId: body?.id ?? null };
}
