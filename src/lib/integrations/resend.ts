type LeadEmailPayload = {
  leadName: string;
  leadEmail: string;
  source: string;
  businessName?: string;
  message?: string;
};

type ReportDeliveryPayload = {
  leadName: string;
  leadEmail: string;
  businessName: string;
  score: number;
  verdict: string;
  topFindings: string[];
  unlockUrl: string;
};

type AutomationSummaryPayload = {
  leadEmail: string;
  businessName: string;
  planLabel: string;
  cadenceLabel: string;
  score: number;
  completedAt: string;
  highlights: string[];
  workspaceUrl: string;
};

type CustomerMagicLinkPayload = {
  email: string;
  verifyUrl: string;
  expiresMinutes: number;
};

type OutreachEmailPayload = {
  to: string;
  businessName: string;
  targetName: string;
  angle: string;
  pitch: string;
  referenceUrl: string;
};

function resendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY ?? "",
    from: process.env.RESEND_FROM_EMAIL ?? "",
    internalTo: process.env.LEAD_NOTIFICATION_EMAIL ?? "",
    confirmationsEnabled: (process.env.RESEND_SEND_CONFIRMATION_TO_LEAD ?? "true").toLowerCase() === "true",
  };
}

async function sendEmail(input: { to: string; subject: string; html: string }) {
  const cfg = resendConfig();
  if (!cfg.apiKey || !cfg.from) {
    return { ok: false, skipped: true, reason: "missing resend config" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      from: cfg.from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error: ${res.status} ${body}`);
  }
  return { ok: true, skipped: false };
}

export async function sendLeadEmails(payload: LeadEmailPayload, isNewLead: boolean) {
  const cfg = resendConfig();
  const tasks: Array<Promise<unknown>> = [];

  if (cfg.internalTo) {
    tasks.push(
      sendEmail({
        to: cfg.internalTo,
        subject: `${isNewLead ? "New" : "Updated"} lead: ${payload.leadName} (${payload.source})`,
        html: `<p><strong>${payload.leadName}</strong> submitted a lead.</p>
               <p>Email: ${payload.leadEmail}</p>
               <p>Source: ${payload.source}</p>
               <p>Business: ${payload.businessName ?? "Unknown"}</p>
               <p>Message: ${payload.message ?? "n/a"}</p>`,
      })
        .then(() => console.info("[lead-email] internal notification sent", { email: payload.leadEmail }))
        .catch((error) => console.error("[lead-email] internal notification failed", { error })),
    );
  }

  if (cfg.confirmationsEnabled) {
    tasks.push(
      sendEmail({
        to: payload.leadEmail,
        subject: "Thanks for contacting GravyBlock",
        html: `<p>Hi ${payload.leadName},</p>
               <p>Thanks for your message. If a reply is needed, you will hear from us by email.</p>
               <p>- GravyBlock</p>`,
      })
        .then(() => console.info("[lead-email] confirmation sent", { email: payload.leadEmail }))
        .catch((error) => console.error("[lead-email] confirmation failed", { error })),
    );
  }

  await Promise.allSettled(tasks);
}

export async function sendReportDeliveryEmail(payload: ReportDeliveryPayload) {
  return sendEmail({
    to: payload.leadEmail,
    subject: `${payload.businessName} report unlocked — score ${payload.score}`,
    html: `<p>Hi ${payload.leadName},</p>
           <p>Your full GravyBlock report is unlocked.</p>
           <p><strong>${payload.businessName}</strong><br/>Score: <strong>${payload.score}</strong><br/>Verdict: ${payload.verdict}</p>
           <p>Top findings:</p>
           <ul>${payload.topFindings.map((f) => `<li>${f}</li>`).join("")}</ul>
           <p><a href="${payload.unlockUrl}">Open full report</a></p>
           <p>- GravyBlock</p>`,
  });
}

export async function sendAutomationSummaryEmail(payload: AutomationSummaryPayload) {
  return sendEmail({
    to: payload.leadEmail,
    subject: `${payload.planLabel} automation summary: ${payload.businessName}`,
    html: `<p>Automation summary for <strong>${payload.businessName}</strong></p>
           <p>Plan: ${payload.planLabel}<br/>Cadence: ${payload.cadenceLabel}<br/>Latest score: ${payload.score}<br/>Completed: ${payload.completedAt}</p>
           <p>Highlights:</p>
           <ul>${payload.highlights.map((h) => `<li>${h}</li>`).join("")}</ul>
           <p><a href="${payload.workspaceUrl}">Open workspace</a></p>
           <p>This is a scaffold summary generated from current automation queues.</p>`,
  });
}

export async function sendCustomerMagicLinkEmail(payload: CustomerMagicLinkPayload) {
  return sendEmail({
    to: payload.email,
    subject: "Your secure sign-in link",
    html: `<p>Your secure GravyBlock sign-in link is ready.</p>
           <p><a href="${payload.verifyUrl}">Open dashboard</a></p>
           <p>Use this link to open your GravyBlock dashboard. It expires in ${payload.expiresMinutes} minutes.</p>
           <p>No password required.</p>`,
  });
}

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  google: { label: "Google", color: "#4285F4" },
  yelp: { label: "Yelp", color: "#d32323" },
  tripadvisor: { label: "TripAdvisor", color: "#00aa6c" },
};

type NewReviewsEmailPayload = {
  to: string;
  businessName: string;
  workspaceUrl: string;
  reviews: Array<{
    authorName: string;
    rating: number;
    text: string | null;
    suggestedReply: string | null;
    publishTime: Date | null;
    source?: string;
  }>;
};

export async function sendNewReviewsEmail(payload: NewReviewsEmailPayload) {
  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

  const reviewsHtml = payload.reviews
    .map((r) => {
      const platform = PLATFORM_LABELS[r.source ?? "google"] ?? PLATFORM_LABELS.google;
      const platformBadge = `<span style="display:inline-block;background:${platform.color};color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;letter-spacing:0.05em;margin-bottom:8px">${platform.label}</span>`;
      return `
      <div style="border:1px solid #e4e4e7;border-radius:12px;padding:16px;margin:12px 0;background:#fafafa">
        ${platformBadge}
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#18181b">${r.authorName}</p>
        <p style="margin:0 0 8px;font-size:16px;color:#dc2626">${stars(r.rating)} ${r.rating}/5</p>
        ${r.text ? `<p style="margin:0 0 12px;font-size:14px;color:#3f3f46;font-style:italic">"${r.text}"</p>` : `<p style="margin:0 0 12px;font-size:13px;color:#a1a1aa">No review text.</p>`}
        ${
          r.suggestedReply
            ? `<div style="background:#fff;border:1px solid #d4d4d8;border-radius:8px;padding:12px">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a">Suggested reply</p>
                <p style="margin:0;font-size:13px;color:#18181b">${r.suggestedReply}</p>
               </div>`
            : ""
        }
      </div>`;
    })
    .join("");

  // Count per-platform for a useful subject line
  const platformCounts = payload.reviews.reduce<Record<string, number>>((acc, r) => {
    const s = r.source ?? "google";
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const platformSummary = Object.entries(platformCounts)
    .map(([s, n]) => `${n} ${PLATFORM_LABELS[s]?.label ?? s}`)
    .join(", ");

  return sendEmail({
    to: payload.to,
    subject: `${payload.reviews.length} new review${payload.reviews.length > 1 ? "s" : ""} for ${payload.businessName} — ${platformSummary}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">New Reviews</p>
        <h1 style="margin:8px 0 4px;font-size:22px;font-weight:700;color:#18181b">${payload.businessName} has ${payload.reviews.length} new review${payload.reviews.length > 1 ? "s" : ""}</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#52525b">We've drafted a suggested reply for each one. Copy, tweak if needed, then paste into the platform directly.</p>
        ${reviewsHtml}
        <div style="margin-top:24px;text-align:center">
          <a href="${payload.workspaceUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:12px 28px;border-radius:9999px;font-weight:700;font-size:14px;text-decoration:none">
            Open workspace
          </a>
        </div>
        <p style="margin-top:24px;font-size:12px;color:#a1a1aa;text-align:center">GravyBlock · Unsubscribe from review alerts in your workspace settings.</p>
      </div>`,
  });
}

export async function sendOutreachEmail(payload: OutreachEmailPayload) {
  return sendEmail({
    to: payload.to,
    subject: `${payload.businessName}: ${payload.angle}`,
    html: `<p>Hello ${payload.targetName},</p>
           <p>${payload.pitch}</p>
           <p>Reference: <a href="${payload.referenceUrl}">${payload.referenceUrl}</a></p>
           <p>Thanks,<br/>${payload.businessName}</p>`,
  });
}
