import { and, count, gte, inArray } from "drizzle-orm";
import { getDb, publishedContent, contentQueue, operatorTasks } from "@/lib/db";
import { getHouseFleetStatus } from "@/lib/house";
import { getInternalBusinesses } from "@/lib/reporting/classification";
import {
  getOutreachFunnel,
  getPublicFunnel,
  getRealCustomers,
  getScanCounts,
  measure,
  pct,
  show,
  type Metric,
  type OutreachFunnel,
  type PublicFunnel,
  type ScanCounts,
} from "@/lib/reporting/acquisition";

const OWNER_EMAIL = "chris@gravyblock.com";

const DAY = 24 * 60 * 60 * 1000;
const windows = [
  { label: "Today (24h)", ms: DAY },
  { label: "7 days", ms: 7 * DAY },
  { label: "30 days", ms: 30 * DAY },
] as const;

const th = "padding:6px 10px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em";
const td = "padding:6px 10px;text-align:right;font-weight:700;color:#18181b";
const tdl = "padding:6px 10px 6px 0;color:#52525b;font-size:13px";
const sub = "padding:0 10px 6px;text-align:right;font-size:11px;color:#a1a1aa";

function funnelTable(stages: Array<{ label: string; values: Array<number | null> }>) {
  const head = `<tr><th style="${th};text-align:left;padding-left:0"></th>${windows.map((w) => `<th style="${th}">${w.label}</th>`).join("")}</tr>`;
  const rows = stages
    .map((s, i) => {
      const prev = i > 0 ? stages[i - 1] : null;
      const conv = prev
        ? `<tr><td style="${sub};text-align:left;padding-left:0"></td>${s.values.map((v, k) => `<td style="${sub}">${pct(v, prev.values[k])} of previous</td>`).join("")}</tr>`
        : "";
      return `${conv}<tr><td style="${tdl}">${s.label}</td>${s.values.map((v) => `<td style="${td}">${show(v)}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse">${head}${rows}</table>`;
}

/** Builds the report without sending it (also used for preview). Read-only. */
export async function buildDailyOwnerReport(): Promise<{ subject: string; html: string } | null> {
  const db = getDb();
  if (!db) return null;

  // Read-only: classification runs in its own worker job, never inside report rendering.
  const since24h = new Date(Date.now() - DAY);
  const since7d = new Date(Date.now() - 7 * DAY);

  const [realM, internalM, scanAllM, scan7dM, publicFunnels, outreachFunnels] = await Promise.all([
    measure("customers", getRealCustomers),
    measure("internal accounts", getInternalBusinesses),
    measure("scans all", () => getScanCounts()),
    measure("scans 7d", () => getScanCounts(since7d)),
    Promise.all(windows.map((w) => getPublicFunnel(new Date(Date.now() - w.ms)))),
    Promise.all(windows.map((w) => getOutreachFunnel(new Date(Date.now() - w.ms)))),
  ]);

  const work = async (ids: string[]) => {
    if (!ids.length) return { published: 0, queued: 0, tasks: 0 };
    const [p, q, t] = await Promise.all([
      db.select({ n: count() }).from(publishedContent).where(and(inArray(publishedContent.businessId, ids), gte(publishedContent.createdAt, since24h))),
      db.select({ n: count() }).from(contentQueue).where(and(inArray(contentQueue.businessId, ids), gte(contentQueue.createdAt, since24h))),
      db.select({ n: count() }).from(operatorTasks).where(and(inArray(operatorTasks.businessId, ids), gte(operatorTasks.createdAt, since24h))),
    ]);
    return { published: p[0]?.n ?? 0, queued: q[0]?.n ?? 0, tasks: t[0]?.n ?? 0 };
  };
  const customerIds = realM.ok ? realM.value.customers.map((c) => c.id) : [];
  const operatedIds = internalM.ok ? [...internalM.value.entries()].filter(([, r]) => r === "house_account").map(([id]) => id) : [];
  const [customerWorkM, operatedWorkM] = await Promise.all([measure("customer work", () => work(customerIds)), measure("operated work", () => work(operatedIds))]);
  const workText = (m: Metric<{ published: number; queued: number; tasks: number }>) => (m.ok ? `${m.value.published} / ${m.value.queued} / ${m.value.tasks}` : "Unavailable");

  const houseM = await measure("house accounts", getHouseFleetStatus);
  const houseLine = houseM.ok
    ? `${houseM.value.filter((h) => h.health === "GREEN").length} green, ${houseM.value.filter((h) => h.health === "YELLOW").length} yellow, ${houseM.value.filter((h) => h.health === "RED").length} red of ${houseM.value.length}${houseM.value.some((h) => h.health === "RED") ? `. Needs attention: ${houseM.value.filter((h) => h.health === "RED").map((h) => `${h.name} (${h.reasons.join(", ")})`).join("; ")}` : ""}`
    : "Unavailable";

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const pf = (k: keyof PublicFunnel) => publicFunnels.map((f) => f[k]);
  const of = (k: keyof OutreachFunnel) => outreachFunnels.map((f) => f[k]);

  const customerRows = realM.ok
    ? realM.value.customers.map((c) => `<tr><td style="${tdl};font-weight:600;color:#18181b">${c.name}</td><td style="${tdl}">${c.email}</td><td style="${td}">$${c.monthly.toFixed(2)}/mo</td></tr>`).join("")
    : "";
  const excludedLine = realM.ok
    ? realM.value.excluded.length
      ? realM.value.excluded.map((e) => `${e.name} (${e.reason.replace(/_/g, " ")})`).join(", ")
      : "none"
    : "Unavailable";

  const scanCell = (m: Metric<ScanCounts>, k: keyof ScanCounts) => (m.ok ? m.value[k].toLocaleString() : "Unavailable");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock internal</p>
  <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Daily report — ${dateStr}</h1>

  <p style="margin:20px 0 0;font-size:22px;font-weight:800;color:#18181b">Real paying customers: ${realM.ok ? realM.value.customers.length : "Unavailable"}</p>
  <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:#18181b">Customer MRR: ${realM.ok ? `$${realM.value.mrr.toFixed(2)}` : "Unavailable"}</p>
  ${customerRows ? `<table style="width:100%;border-collapse:collapse;margin-top:10px">${customerRows}</table>` : ""}
  <p style="margin:8px 0 0;font-size:11px;color:#a1a1aa">Owner, staff, test and house accounts are excluded from customers, MRR and conversion. Excluded paid/active accounts: ${excludedLine}. Internal accounts classified: ${internalM.ok ? internalM.value.size : "Unavailable"}.</p>

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:28px 0 8px">REAL WEBSITE FUNNEL (public visitors only)</h2>
  ${funnelTable([
    { label: "Visitors (reached /scan, /pricing or a report)", values: pf("visitors") },
    { label: "Scan started", values: pf("scanStarted") },
    { label: "Scan completed", values: pf("scanCompleted") },
    { label: "Report unlocked / email captured", values: pf("unlocked") },
    { label: "Start GravyBlock clicked", values: pf("startClicked") },
    { label: "Checkout started", values: pf("checkoutStarted") },
    { label: "Paid", values: pf("paid") },
  ])}
  <p style="margin:6px 0 0;font-size:11px;color:#a1a1aa">Source: GravyBlock first-party events (one visitor = one browser session). "Unavailable" means the query failed, not that the value is zero. Google Analytics is not read by this report. Cold-outreach and internal sessions are excluded.</p>

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:28px 0 8px">OUTREACH FUNNEL (cold prospecting, separate)</h2>
  ${funnelTable([
    { label: "Initial outreach delivered", values: of("delivered") },
    { label: "Personalized report visited", values: of("reportVisits") },
    { label: "Report unlocked", values: of("unlocked") },
    { label: "Checkout started", values: of("checkoutStarted") },
    { label: "Paid", values: of("paid") },
  ])}

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:28px 0 8px">SCANS BY ORIGIN</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><th style="${th};text-align:left;padding-left:0"></th><th style="${th}">All time</th><th style="${th}">7 days</th></tr>
    ${(
      [
        ["Public (real visitor started /scan)", "public"],
        ["Outreach prospect scans", "outreach"],
        ["Internal / QA", "internal"],
        ["System / automated", "system"],
        ["Unknown (historical, not classifiable)", "unknown"],
        ["Total scan records", "total"],
      ] as const
    )
      .map(([label, k]) => `<tr><td style="${tdl}">${label}</td><td style="${td}">${scanCell(scanAllM, k)}</td><td style="${td}">${scanCell(scan7dM, k)}</td></tr>`)
      .join("")}
  </table>
  <p style="margin:6px 0 0;font-size:11px;color:#a1a1aa">Only public scans belong in website conversion math.</p>

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:28px 0 8px">AUTOPILOT (last 24h)</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="${tdl}">Customer work: articles published / content queued / tasks</td><td style="${td}">${workText(customerWorkM)}</td></tr>
    <tr><td style="${tdl}">Owner-operated businesses (not customers): published / queued / tasks</td><td style="${td}">${workText(operatedWorkM)}</td></tr>
  </table>
  <p style="margin:8px 0 0;font-size:12px;color:#52525b">House account health: ${houseLine}</p>
</div>
</body></html>`;

  return { subject: `GravyBlock daily report — ${dateStr}`, html };
}

export async function sendDailyOwnerReport(): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;
  const report = await buildDailyOwnerReport();
  if (!report) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [OWNER_EMAIL], subject: report.subject, html: report.html }),
    });
    return res.ok;
  } catch (err) {
    console.error("[daily-report] send failed", err);
    return false;
  }
}
