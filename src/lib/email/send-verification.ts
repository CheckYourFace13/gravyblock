import { verifyEmailUrl } from "@/lib/auth/email-verify";

/** Sends an account-email verification link. Best-effort; never throws. */
export async function sendVerificationEmail(businessId: string, email: string, businessName: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <chris@gravyblock.com>";
  const url = verifyEmailUrl(businessId, email);

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:520px;margin:0 auto;padding:32px 20px">
  <p>Hi,</p>
  <p>Please confirm this is the right email for <strong>${businessName}</strong>'s GravyBlock account. One click:</p>
  <p style="text-align:center;margin:24px 0"><a href="${url}" style="display:inline-block;background:#dc2626;color:#fff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px">Confirm my email →</a></p>
  <p style="font-size:13px;color:#777">If you didn't sign up for GravyBlock, you can ignore this email.</p>
  </body></html>`;
  const text = `Confirm your GravyBlock account email for ${businessName}:\n${url}\n\nIf you didn't sign up, ignore this.`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [email], subject: `Confirm your GravyBlock email`, html, text, tags: [{ name: "type", value: "email_verification" }] }),
    });
  } catch { /* best-effort */ }
}
