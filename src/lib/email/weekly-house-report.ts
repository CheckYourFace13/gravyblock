import { gatherPortfolioReport, renderPortfolioReport } from "@/lib/reporting/portfolio-report";

const OWNER_EMAIL = "chris@gravyblock.com";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The one consolidated Friday report for the 12 House Accounts. Read-only; goes to the owner only. */
export async function buildWeeklyHouseReport(): Promise<{ subject: string; html: string; text: string }> {
  const text = renderPortfolioReport(await gatherPortfolioReport(7));
  const day = new Date().toISOString().slice(0, 10);
  return {
    subject: `GravyBlock House Accounts: weekly growth report ${day}`,
    text,
    html: `<div style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto"><pre style="font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;color:#18181b">${escapeHtml(text)}</pre><p style="font-size:11px;color:#71717a">Numbers marked "not measured" or "unavailable" are unknown, not zero. Nothing in this report is estimated.</p></div>`,
  };
}

/** Returns true only when Resend accepted the message (so the caller records exactly one send for the week). */
export async function sendWeeklyHouseReport(): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;
  const report = await buildWeeklyHouseReport();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [OWNER_EMAIL], subject: report.subject, html: report.html, text: report.text }),
    });
    return res.ok;
  } catch (err) {
    console.error("[weekly-house-report] send failed", err);
    return false;
  }
}
