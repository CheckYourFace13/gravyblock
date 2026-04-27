import { createSetupToken } from "@/lib/setup/tokens";

export async function sendSetupEmail(businessId: string, businessName: string, email: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const token = await createSetupToken(businessId, email);
  if (!token) return false;

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";
  const setupUrl = `${base}/setup/${token}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock</p>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:700;color:#18181b">Let's set up your autopilot</h1>
    <p style="color:#52525b;font-size:15px;line-height:1.6;margin:16px 0">
      Hi there — GravyBlock is running for <strong>${businessName}</strong>. To make the content, outreach,
      and visibility work as accurate as possible, we need a couple of minutes of your input.
    </p>
    <p style="color:#52525b;font-size:15px;line-height:1.6;margin:0 0 24px">
      Just click the button below — no login required. You can reply to this email too and we'll add anything
      you share directly to your account context.
    </p>
    <a href="${setupUrl}"
       style="display:inline-block;background:#dc2626;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:100px;text-decoration:none">
      Set up my account →
    </a>
    <p style="color:#a1a1aa;font-size:12px;margin:24px 0 0">
      This link expires in 7 days. Questions? Reply to this email or visit
      <a href="${base}" style="color:#dc2626">${base.replace("https://", "")}</a>.
    </p>
  </div>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "GravyBlock <hello@gravyblock.com>",
        to: [email],
        subject: `Set up your GravyBlock autopilot for ${businessName}`,
        html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
