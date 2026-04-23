type LeadEmailPayload = {
  leadName: string;
  leadEmail: string;
  source: string;
  businessName?: string;
  message?: string;
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
