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
  facebook: { label: "Facebook", color: "#1877F2" },
  trustpilot: { label: "Trustpilot", color: "#00b67a" },
  bbb: { label: "BBB", color: "#005fa8" },
};

const stars = (n: number) => "★".repeat(Math.max(0, Math.min(5, n))) + "☆".repeat(Math.max(0, 5 - Math.min(5, n)));

type DigestReview = {
  authorName: string;
  rating: number;
  text: string | null;
  suggestedReply: string | null;
  publishTime: Date | null;
};

type DigestPlatformGroup = {
  source: string;
  reviews: DigestReview[];
};

type WeeklyDigestPayload = {
  to: string;
  businessName: string;
  workspaceUrl: string;
  // Snapshot stats
  googleRating: string | null;
  totalReviewCount: number;
  // New reviews grouped by platform (max 5 per platform)
  reviewGroups: DigestPlatformGroup[];
  // Content activity
  publishedThisWeek: Array<{ title: string; channel: string; publicUrl: string | null }>;
  contentQueued: Array<{ title: string; kind: string; targetKeyword: string | null }>;
};

function platformSection(group: DigestPlatformGroup): string {
  const pl = PLATFORM_LABELS[group.source] ?? { label: group.source, color: "#71717a" };
  const badge = `<span style="display:inline-block;background:${pl.color};color:#fff;font-size:10px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:0.06em">${pl.label}</span>`;

  const reviewCards = group.reviews.map((r) => `
    <div style="border:1px solid #e4e4e7;border-radius:10px;padding:14px;margin:10px 0;background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;font-weight:700;color:#18181b">${r.authorName}</span>
        <span style="font-size:14px;color:#f59e0b;letter-spacing:1px">${stars(r.rating)}</span>
      </div>
      ${r.text
        ? `<p style="margin:0 0 10px;font-size:13px;color:#3f3f46;font-style:italic;line-height:1.5">"${r.text}"</p>`
        : `<p style="margin:0 0 10px;font-size:12px;color:#a1a1aa">No review text.</p>`}
      ${r.suggestedReply
        ? `<div style="background:#f9fafb;border-left:3px solid ${pl.color};border-radius:0 6px 6px 0;padding:10px 12px">
             <p style="margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#71717a">Suggested reply</p>
             <p style="margin:0;font-size:13px;color:#18181b;line-height:1.5">${r.suggestedReply}</p>
           </div>`
        : ""}
    </div>`).join("");

  return `
    <div style="margin-bottom:24px">
      <div style="margin-bottom:8px">${badge} <span style="font-size:12px;color:#71717a;margin-left:6px">${group.reviews.length} new review${group.reviews.length > 1 ? "s" : ""}</span></div>
      ${reviewCards}
    </div>`;
}

export async function sendWeeklyDigestEmail(payload: WeeklyDigestPayload) {
  const totalNewReviews = payload.reviewGroups.reduce((sum, g) => sum + g.reviews.length, 0);
  const hasContent = payload.publishedThisWeek.length > 0 || payload.contentQueued.length > 0;

  // ── Subject line ────────────────────────────────────────────────────────────
  const parts: string[] = [];
  if (totalNewReviews > 0) parts.push(`${totalNewReviews} new review${totalNewReviews > 1 ? "s" : ""}`);
  if (payload.publishedThisWeek.length > 0) parts.push(`${payload.publishedThisWeek.length} published`);
  const subject = parts.length
    ? `${payload.businessName} — ${parts.join(", ")} this week`
    : `${payload.businessName} — your weekly GravyBlock summary`;

  // ── Stat pills ──────────────────────────────────────────────────────────────
  const statPill = (icon: string, label: string, value: string) =>
    `<div style="text-align:center;padding:12px 16px;background:#f4f4f5;border-radius:10px;min-width:100px">
       <div style="font-size:18px">${icon}</div>
       <div style="font-size:18px;font-weight:800;color:#18181b;margin:2px 0">${value}</div>
       <div style="font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">${label}</div>
     </div>`;

  const statsHtml = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:20px 0">
      ${payload.googleRating ? statPill("⭐", "Google rating", payload.googleRating) : ""}
      ${statPill("💬", "Total reviews", String(payload.totalReviewCount))}
      ${totalNewReviews > 0 ? statPill("🆕", "New this week", String(totalNewReviews)) : ""}
      ${payload.publishedThisWeek.length > 0 ? statPill("📝", "Published", String(payload.publishedThisWeek.length)) : ""}
    </div>`;

  // ── Reviews section ──────────────────────────────────────────────────────────
  const reviewsHtml = payload.reviewGroups.length > 0
    ? `<div style="margin-top:28px">
         <h2 style="margin:0 0 4px;font-size:16px;font-weight:700;color:#18181b">New reviews</h2>
         <p style="margin:0 0 16px;font-size:13px;color:#71717a">Copy the suggested reply, tweak if needed, then paste it directly on the platform.</p>
         ${payload.reviewGroups.map(platformSection).join("")}
       </div>`
    : "";

  // ── Published content ────────────────────────────────────────────────────────
  const channelLabel = (ch: string) =>
    ({ wordpress: "WordPress", internal_site: "GravyBlock site", facebook_post: "Facebook", instagram_post: "Instagram", internal_draft: "Draft" }[ch] ?? ch);

  const publishedHtml = payload.publishedThisWeek.length > 0
    ? `<div style="margin-top:28px">
         <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#18181b">Published this week</h2>
         ${payload.publishedThisWeek.map((item) => `
           <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f4f4f5">
             <span style="font-size:13px;color:#18181b;font-weight:500">${item.title}</span>
             <span style="font-size:11px;color:#71717a;white-space:nowrap;margin-left:12px">${channelLabel(item.channel)}${item.publicUrl ? ` · <a href="${item.publicUrl}" style="color:#4285F4;text-decoration:none">View →</a>` : ""}</span>
           </div>`).join("")}
       </div>`
    : "";

  // ── Content queue ────────────────────────────────────────────────────────────
  const queueHtml = payload.contentQueued.length > 0
    ? `<div style="margin-top:28px">
         <h2 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#18181b">Coming up</h2>
         <p style="margin:0 0 10px;font-size:13px;color:#71717a">Autopilot will publish these on your next scheduled run.</p>
         ${payload.contentQueued.slice(0, 3).map((item) => `
           <div style="padding:8px 12px;background:#f9fafb;border-radius:8px;margin-bottom:6px">
             <span style="font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em">${item.kind.replace(/_/g, " ")}</span>
             <p style="margin:2px 0 0;font-size:13px;color:#18181b;font-weight:500">${item.title}</p>
             ${item.targetKeyword ? `<p style="margin:2px 0 0;font-size:11px;color:#a1a1aa">${item.targetKeyword}</p>` : ""}
           </div>`).join("")}
       </div>`
    : "";

  // ── No activity fallback ─────────────────────────────────────────────────────
  const noActivityHtml = !totalNewReviews && !hasContent
    ? `<p style="margin:20px 0;font-size:14px;color:#71717a;text-align:center">No new reviews or content activity this week — autopilot is running in the background.</p>`
    : "";

  return sendEmail({
    to: payload.to,
    subject,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#18181b">

        <!-- Header -->
        <div style="background:#18181b;border-radius:14px 14px 0 0;padding:24px 28px">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#dc2626">GravyBlock</p>
          <h1 style="margin:4px 0 2px;font-size:20px;font-weight:800;color:#fff">${payload.businessName}</h1>
          <p style="margin:0;font-size:13px;color:#a1a1aa">Weekly activity summary · ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </div>

        <!-- Body -->
        <div style="background:#fff;padding:24px 28px;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 14px 14px">

          ${statsHtml}
          ${noActivityHtml}
          ${reviewsHtml}
          ${publishedHtml}
          ${queueHtml}

          <!-- CTA -->
          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #f4f4f5;text-align:center">
            <a href="${payload.workspaceUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:13px 32px;border-radius:9999px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.01em">
              Open workspace →
            </a>
            <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">
              GravyBlock &middot; You&apos;re receiving this as part of your active plan. &middot;
              <a href="https://gravyblock.com/api/unsubscribe?e=${Buffer.from(payload.to.toLowerCase()).toString("base64url")}" style="color:#a1a1aa;text-decoration:underline">Unsubscribe</a>
            </p>
          </div>

        </div>
      </div>`,
  });
}

/** Legacy single-trigger email — kept for backwards compat, routes to digest. */
export async function sendNewReviewsEmail(payload: {
  to: string;
  businessName: string;
  workspaceUrl: string;
  reviews: Array<{ authorName: string; rating: number; text: string | null; suggestedReply: string | null; publishTime: Date | null; source?: string }>;
}) {
  // Group by platform and cap at 5 per platform
  const grouped = new Map<string, DigestReview[]>();
  for (const r of payload.reviews) {
    const src = r.source ?? "google";
    if (!grouped.has(src)) grouped.set(src, []);
    const arr = grouped.get(src)!;
    if (arr.length < 5) arr.push(r);
  }
  return sendWeeklyDigestEmail({
    to: payload.to,
    businessName: payload.businessName,
    workspaceUrl: payload.workspaceUrl,
    googleRating: null,
    totalReviewCount: 0,
    reviewGroups: Array.from(grouped.entries()).map(([source, reviews]) => ({ source, reviews })),
    publishedThisWeek: [],
    contentQueued: [],
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
