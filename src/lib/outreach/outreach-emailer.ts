import type { Prospect } from "./prospect-finder";

type SendEmailResult = { ok: boolean; skipped?: boolean; reason?: string };

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>",
  };
}

function buildSubjectLine(businessName: string): string {
  return `Quick question about ${businessName}'s Google visibility`;
}

function buildEmailBody(prospect: Prospect, senderLabel: string): string {
  const { businessName, weaknessReasons, reviewCount, rating, website } = prospect;

  // Pick the most specific weakness to lead with
  let leadDetail = "";
  if (reviewCount !== undefined && reviewCount < 15) {
    leadDetail =
      reviewCount === 0
        ? `${businessName} doesn't have any Google reviews yet`
        : `${businessName} only has ${reviewCount} review${reviewCount === 1 ? "" : "s"} on Google`;
  } else if (rating !== undefined && rating < 3.8) {
    leadDetail = `${businessName}'s Google rating is sitting at ${rating} stars`;
  } else if (!website) {
    leadDetail = `${businessName} doesn't have a website showing up on Google`;
  } else if (weaknessReasons.length > 0) {
    leadDetail = `I noticed some things that could help ${businessName} show up better on Google`;
  }

  // Build the "other issues" list if there's more than one weakness
  const otherReasons = weaknessReasons.filter((r) => {
    if (reviewCount !== undefined && reviewCount < 15 && r.includes("review")) return false;
    if (rating !== undefined && rating < 3.8 && r.includes("rating")) return false;
    if (!website && r.includes("website")) return false;
    return true;
  });

  let bodyLines = `Hi there,\n\nI was looking at local businesses in your area and noticed that ${leadDetail}.`;

  if (otherReasons.length > 0) {
    bodyLines += ` There's also ${otherReasons[0]}.`;
  }

  bodyLines += `\n\nI work at ${senderLabel} and we built a free tool called GravyBlock that helps local businesses fix exactly this — it scans your Google profile, spots the gaps, and gives you a clear action plan to get more visibility and reviews.`;

  bodyLines += `\n\nWould it be helpful if I sent you a free scan? It takes about 30 seconds and you'll see exactly where you stand compared to other ${prospect.city} businesses in your category.`;

  bodyLines += `\n\nYou can run it yourself here: https://gravyblock.com\n\nNo pitch, no credit card. Just the data.`;

  bodyLines += `\n\nThanks,\n${senderLabel}`;

  return bodyLines;
}

function buildHtml(textBody: string): string {
  const escaped = textBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n\n")
    .map((para) => `<p>${para.replace(/\n/g, "<br/>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#222;max-width:560px;margin:0 auto;padding:20px">
${escaped}
</body>
</html>`;
}

export async function sendProspectEmail(
  prospect: Prospect,
  senderContext?: { agencyName?: string },
): Promise<SendEmailResult> {
  const cfg = resendConfig();

  if (!cfg.apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }

  if (!prospect.phone && !prospect.website) {
    // No way to reach them from Places data alone — we'd need an email address
    // For now, skip if there's no contact info to derive an email from
    return { ok: false, skipped: true, reason: "no contact info available for prospect" };
  }

  // Derive a best-guess contact email from website domain if available
  let toEmail: string | null = null;
  if (prospect.website) {
    try {
      const domain = new URL(prospect.website).hostname.replace(/^www\./, "");
      toEmail = `info@${domain}`;
    } catch {
      // malformed website URL
    }
  }

  if (!toEmail) {
    return { ok: false, skipped: true, reason: "could not derive contact email from prospect data" };
  }

  const senderLabel = senderContext?.agencyName ?? "GravyBlock";
  const subject = buildSubjectLine(prospect.businessName);
  const textBody = buildEmailBody(prospect, senderLabel);
  const html = buildHtml(textBody);

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
      text: textBody,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }

  return { ok: true };
}
