import { gatherPortfolioReport, renderPortfolioReport } from "@/lib/reporting/portfolio-report";
import { buildSearchSection, generateMissingSearchIntel, markEmailed } from "@/lib/search-intel";
import type { EmailItem } from "@/lib/search-intel/recommendations";

const OWNER_EMAIL = "chris@gravyblock.com";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The one consolidated Friday report for the 12 House Accounts. Read-only; goes to the owner only. */
export async function buildWeeklyHouseReport(): Promise<{ subject: string; html: string; text: string; included: EmailItem[] }> {
  // The weekly search and competitor reports are normally generated before the send; any still missing are generated here (a few at a time) so the one email is complete.
  await generateMissingSearchIntel(new Date(), 3).catch(() => null);
  const search = await buildSearchSection().catch((err) => ({ text: `WEEKLY SEARCH AND COMPETITOR INTELLIGENCE: unavailable (${err instanceof Error ? err.message : "error"})`, html: "", included: [] as EmailItem[] }));
  const text = `${search.text}\n\n${renderPortfolioReport(await gatherPortfolioReport(7))}`;
  const day = new Date().toISOString().slice(0, 10);
  return {
    subject: `GravyBlock House Accounts: weekly growth report ${day}`,
    text,
    included: search.included,
    html: `${search.html}<div style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto"><pre style="font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.5;white-space:pre-wrap;color:#18181b">${escapeHtml(text)}</pre><p style="font-size:11px;color:#71717a">Numbers marked "not measured" or "unavailable" are unknown, not zero. Nothing in this report is estimated.</p></div>`,
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
    if (res.ok) await markEmailed(report.included).catch((err) => console.error("[weekly-house-report] could not record what was emailed", err));
    return res.ok;
  } catch (err) {
    console.error("[weekly-house-report] send failed", err);
    return false;
  }
}
