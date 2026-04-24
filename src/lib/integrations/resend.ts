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
  planLabel: "Base" | "Pro";
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
