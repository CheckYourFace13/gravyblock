import { and, count, gte, inArray } from "drizzle-orm";
import { getDb, publishedContent, contentQueue, operatorTasks } from "@/lib/db";
import { backfillScanClassification, getInternalBusinesses, markInternalBusinesses } from "@/lib/reporting/classification";
import { getOutreachFunnel, getPublicFunnel, getRealCustomers, getScanCounts, pct, type OutreachFunnel, type PublicFunnel } from "@/lib/reporting/acquisition";

const OWNER_EMAIL = "chris@gravyblock.com";

const DAY = 24 * 60 * 60 * 1000;
const windows = [
  { label: "Today (24h)", since: () => new Date(Date.now() - DAY) },
  { label: "7 days", since: () => new Date(Date.now() - 7 * DAY) },
  { label: "30 days", since: () => new Date(Date.now() - 30 * DAY) },
] as const;

const th = "padding:6px 10px;text-align:right;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em";
const td = "padding:6px 10px;text-align:right;font-weight:700;color:#18181b";
const tdl = "padding:6px 10px 6px 0;color:#52525b;font-size:13px";
const sub = "padding:0 10px 6px;text-align:right;font-size:11px;color:#a1a1aa";

function funnelTable(stages: Array<{ label: string; values: number[] }>) {
  const head = `<tr><th style="${th};text-align:left;padding-left:0"></th>${windows.map((w) => `<th style="${th}">${w.label}</th>`).join("")}</tr>`;
  const rows = stages
    .map((s, i) => {
      const prev = i > 0 ? stages[i - 1] : null;
      const conv = prev
        ? `<tr><td style="${sub};text-align:left;padding-left:0">${""}</td>${s.values.map((v, k) => `<td style="${sub}">${pct(v, prev.values[k])} of previous</td>`).join("")}</tr>`
        : "";
      return `${conv}<tr><td style="${tdl}">${s.label}</td>${s.values.map((v) => `<td style="${td}">${v.toLocaleString()}</td>`).join("")}</tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse">${head}${rows}</table>`;
}

/** A failed query must not stop the report from sending; it falls back to an empty value and logs. */
async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`[daily-report] ${label} failed`, error);
    return fallback;
  }
}

export async function sendDailyOwnerReport(): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "GravyBlock <hello@gravyblock.com>";
  if (!apiKey) return false;

  const db = getDb();
  if (!db) return false;

  // Keep the classification current before counting anything (idempotent, never deletes).
  await markInternalBusinesses().catch((e) => console.error("[daily-report] mark internal failed", e));
  await backfillScanClassification().catch((e) => console.error("[daily-report] scan classification failed", e));

  const since24h = new Date(Date.now() - DAY);
  const since7d = new Date(Date.now() - 7 * DAY);

  const [real, internal, scanAll, scan7d, publicFunnels, outreachFunnels] = await Promise.all([
    safe("customers", getRealCustomers, { customers: [], mrr: 0, excluded: [] } as Awaited<ReturnType<typeof getRealCustomers>>),
    safe("internal", getInternalBusinesses, new Map<string, string>()),
    safe("scans", () => getScanCounts(), { public: 0, outreach: 0, internal: 0, system: 0, unknown: 0, total: 0 }),
    safe("scans7d", () => getScanCounts(since7d), { public: 0, outreach: 0, internal: 0, system: 0, unknown: 0, total: 0 }),
    Promise.all(windows.map((w) => safe("public funnel", () => getPublicFunnel(w.since()), { visitors: 0, scanStarted: 0, scanCompleted: 0, unlocked: 0, startClicked: 0, checkoutStarted: 0, paid: 0 }))),
    Promise.all(windows.map((w) => safe("outreach funnel", () => getOutreachFunnel(w.since()), { delivered: 0, reportVisits: 0, unlocked: 0, checkoutStarted: 0, paid: 0 }))),
  ]);

  // Customer work: only for real customers. Owner-operated businesses are shown separately so they are never mistaken for traction.
  const customerIds = real.customers.map((c) => c.id);
  const operatedIds = [...internal.entries()].filter(([, r]) => r === "house_account").map(([id]) => id);
  const work = async (ids: string[]) => {
    if (!ids.length) return { published: 0, queued: 0, tasks: 0 };
    const [p, q, t] = await Promise.all([
      db.select({ n: count() }).from(publishedContent).where(and(inArray(publishedContent.businessId, ids), gte(publishedContent.createdAt, since24h))),
      db.select({ n: count() }).from(contentQueue).where(and(inArray(contentQueue.businessId, ids), gte(contentQueue.createdAt, since24h))),
      db.select({ n: count() }).from(operatorTasks).where(and(inArray(operatorTasks.businessId, ids), gte(operatorTasks.createdAt, since24h))),
    ]);
    return { published: p[0]?.n ?? 0, queued: q[0]?.n ?? 0, tasks: t[0]?.n ?? 0 };
  };
  const none = { published: 0, queued: 0, tasks: 0 };
  const [customerWork, operatedWork] = await Promise.all([safe("customer work", () => work(customerIds), none), safe("operated work", () => work(operatedIds), none)]);

  const dateStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const pf = (k: keyof PublicFunnel) => publicFunnels.map((f) => f[k]);
  const of = (k: keyof OutreachFunnel) => outreachFunnels.map((f) => f[k]);

  const customerRows = real.customers
    .map((c) => `<tr><td style="${tdl};font-weight:600;color:#18181b">${c.name}</td><td style="${tdl}">${c.email}</td><td style="${td}">$${c.monthly.toFixed(2)}/mo</td></tr>`)
    .join("");
  const excludedLine = real.excluded.length
    ? real.excluded.map((e) => `${e.name} (${e.reason.replace(/_/g, " ")})`).join(", ")
    : "none paid";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#f9f9f9;margin:0;padding:24px">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #e4e4e7;padding:32px">
  <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.2em;color:#991b1b">GravyBlock internal</p>
  <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#18181b">Daily report — ${dateStr}</h1>

  <p style="margin:20px 0 0;font-size:22px;font-weight:800;color:#18181b">Real paying customers: ${real.customers.length}</p>
  <p style="margin:2px 0 0;font-size:22px;font-weight:800;color:#18181b">Customer MRR: $${real.mrr.toFixed(2)}</p>
  ${real.customers.length ? `<table style="width:100%;border-collapse:collapse;margin-top:10px">${customerRows}</table>` : ""}
  <p style="margin:8px 0 0;font-size:11px;color:#a1a1aa">Owner, staff, test and house accounts are excluded from customers, MRR and conversion. Excluded paid/active accounts: ${excludedLine}. Internal accounts classified: ${internal.size}.</p>

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
  <p style="margin:6px 0 0;font-size:11px;color:#a1a1aa">Source: GravyBlock first-party events (one visitor = one browser session). Google Analytics is not read by this report. Cold-outreach and internal sessions are excluded.</p>

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
      ] as const
    )
      .map(([label, k]) => `<tr><td style="${tdl}">${label}</td><td style="${td}">${scanAll[k].toLocaleString()}</td><td style="${td}">${scan7d[k].toLocaleString()}</td></tr>`)
      .join("")}
    <tr><td style="${tdl}">Total scan records</td><td style="${td}">${scanAll.total.toLocaleString()}</td><td style="${td}">${scan7d.total.toLocaleString()}</td></tr>
  </table>
  <p style="margin:6px 0 0;font-size:11px;color:#a1a1aa">Only public scans belong in website conversion math.</p>

  <h2 style="font-size:14px;font-weight:700;color:#18181b;margin:28px 0 8px">AUTOPILOT (last 24h)</h2>
  <table style="width:100%;border-collapse:collapse">
    <tr><td style="${tdl}">Customer work: articles published / content queued / tasks</td><td style="${td}">${customerWork.published} / ${customerWork.queued} / ${customerWork.tasks}</td></tr>
    <tr><td style="${tdl}">Owner-operated businesses (not customers): published / queued / tasks</td><td style="${td}">${operatedWork.published} / ${operatedWork.queued} / ${operatedWork.tasks}</td></tr>
  </table>
</div>
</body></html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [OWNER_EMAIL], subject: `GravyBlock daily report — ${dateStr}`, html }),
    });
    return res.ok;
  } catch (err) {
    console.error("[daily-report] send failed", err);
    return false;
  }
}
