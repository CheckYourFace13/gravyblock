import type { Metadata } from "next";
import { getOutreachSettings, getSentEmails, getBatchHistory, getOutreachCounts, getOutreachFunnel, getEmailHealth, type FunnelPeriodStats } from "./actions";
import { WebhookTestForm } from "./webhook-test-form";
import { getCalendarPreview, getTodaysOutreachTarget, getOutreachTargetForOffset, daysSinceEpoch, OUTREACH_WINDOW_OFFSETS } from "@/lib/outreach/outreach-calendar";
import { OutreachSettingsForm } from "./outreach-settings-form";

export const metadata: Metadata = { title: "Outreach — Admin" };
export const dynamic = "force-dynamic";

const WEEKEND_TARGETS = [
  { day: "Saturday", time: "9am UTC",  city: "Houston",   state: "TX", industry: "restaurant" },
  { day: "Saturday", time: "1pm UTC",  city: "Chicago",   state: "IL", industry: "restaurant" },
  { day: "Sunday",   time: "9am UTC",  city: "Miami",     state: "FL", industry: "restaurant" },
  { day: "Sunday",   time: "1pm UTC",  city: "Nashville", state: "TN", industry: "restaurant" },
];

export default async function OutreachPage() {
  const [settings, sentEmails, batches, counts, funnel, health] = await Promise.all([
    getOutreachSettings(),
    getSentEmails(200),
    getBatchHistory(30),
    getOutreachCounts(),
    getOutreachFunnel(),
    getEmailHealth(),
  ]);

  const todaysTarget = getTodaysOutreachTarget();
  const calendar = getCalendarPreview();
  const now = new Date();
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">🎯 Outreach pipeline</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Automated cold email acquisition. Emails send from{" "}
          <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono text-zinc-700">
            {process.env.RESEND_FROM_EMAIL ?? "hello@gravyblock.com"}
          </code>
          {" "}— change via <code className="rounded bg-zinc-100 px-1 text-xs font-mono">RESEND_FROM_EMAIL</code> env var.
        </p>
      </div>

      {/* ── STATS ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="All-time sent" value={String(counts.allTime)} />
        <StatCard label="This month" value={String(counts.thisMonth)} />
        <StatCard label="This week" value={String(counts.thisWeek)} />
        <StatCard
          label="Status"
          value={settings.paused ? "⏸ Paused" : "▶ Running"}
          highlight={!settings.paused}
        />
      </div>

      {/* ── WEBHOOK / EMAIL DELIVERY HEALTH ─────────────────── */}
      <section className={`rounded-2xl border-2 p-6 shadow-sm ${health.redAlert ? "border-red-400 bg-red-50" : health.webhookConfigured ? "border-emerald-200 bg-white" : "border-amber-400 bg-amber-50"}`}>
        <h2 className="text-base font-semibold text-zinc-900 mb-1">📡 Resend webhook health</h2>
        {health.redAlert ? (
          <p className="text-sm font-bold uppercase tracking-wide text-red-700 mb-3">⚠ {health.redAlert}</p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Webhook configured</p>
            <p className="font-semibold text-zinc-900">
              {health.webhookConfigured === null ? `Unknown (${health.webhookCheckError})` : health.webhookConfigured ? "✓ Yes" : "✗ No / incomplete"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Registered endpoint</p>
            <p className="font-semibold text-zinc-900 break-all">{health.registeredEndpoint ?? "none found"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Registered events</p>
            <p className="font-semibold text-zinc-900">{health.registeredEvents.length ? health.registeredEvents.join(", ") : "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Status</p>
            <p className="font-semibold text-zinc-900">{health.registeredStatus ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Last webhook event (any)</p>
            <p className="font-semibold text-zinc-900">{health.lastWebhookEventAt ? new Date(health.lastWebhookEventAt).toLocaleString() : "never"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Last delivered / opened</p>
            <p className="font-semibold text-zinc-900">
              {health.lastDeliveredAt ? new Date(health.lastDeliveredAt).toLocaleDateString() : "never"} /{" "}
              {health.lastOpenedAt ? new Date(health.lastOpenedAt).toLocaleDateString() : "never"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Last clicked / bounced</p>
            <p className="font-semibold text-zinc-900">
              {health.lastClickedAt ? new Date(health.lastClickedAt).toLocaleDateString() : "never"} /{" "}
              {health.lastBouncedAt ? new Date(health.lastBouncedAt).toLocaleDateString() : "never"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Sent / events, last 24h</p>
            <p className="font-semibold text-zinc-900">
              {health.sentLast24h} sent · {health.eventsLast24h} events
              {health.sendsWithAnyEventPct !== null ? ` · ${health.sendsWithAnyEventPct}% of recipients have any event` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-zinc-500">Signing secret matches Resend</p>
            <p className={`font-semibold ${health.secretMatches === false ? "text-red-700" : "text-zinc-900"}`}>
              {health.secretMatches === null
                ? `Unknown${health.secretCheckError ? ` (${health.secretCheckError})` : ""}`
                : health.secretMatches
                  ? "✓ Yes"
                  : "✗ NO — this is very likely why events stopped arriving"}
            </p>
          </div>
        </div>
        <WebhookTestForm />
      </section>

      {/* ── FUNNEL ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Outreach funnel</h2>
        <p className="text-sm text-zinc-500 mb-1">
          Sent/skipped are real for all time. Delivered/bounced/opened/clicked come from the Resend webhook —{" "}
          {funnel.emailEventsTrackingSince
            ? `only reliable from ${new Date(funnel.emailEventsTrackingSince).toLocaleDateString()} forward (webhook signature verification was fixed this session — earlier data may be incomplete or unverified).`
            : "no events recorded yet."}
        </p>
        <p className="text-sm text-zinc-500 mb-5">
          Scan-starts/leads attributed to outreach clicks use first-party tracking shipped{" "}
          {funnel.attributionTrackingSince
            ? `${new Date(funnel.attributionTrackingSince).toLocaleDateString()}`
            : "just now"}
          {" "}— nothing before that date can be attributed and is not estimated.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs uppercase tracking-wide text-zinc-400">
                <th className="pb-2 pr-4 font-semibold">Stage</th>
                <th className="pb-2 pr-4 font-semibold text-right">Today</th>
                <th className="pb-2 pr-4 font-semibold text-right">7 days</th>
                <th className="pb-2 pr-4 font-semibold text-right">30 days</th>
                <th className="pb-2 font-semibold text-right">All time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              <FunnelRow label="Prospects evaluated" field="prospectsEvaluated" funnel={funnel} />
              <FunnelRow label="Skipped (dedup/prescan fail/opted out)" field="skipped" funnel={funnel} />
              <FunnelRow label="Emails attempted" field="emailsAttempted" funnel={funnel} highlight />
              <FunnelRow label="Delivered (webhook)" field="delivered" funnel={funnel} />
              <FunnelRow label="Bounced" field="bounced" funnel={funnel} warn />
              <FunnelRow label="Complained" field="complained" funnel={funnel} warn />
              <FunnelRow label="Unsubscribed" field="unsubscribed" funnel={funnel} warn />
              <FunnelRow label="Opened (webhook)" field="opened" funnel={funnel} />
              <FunnelRow label="Clicked (webhook)" field="clicked" funnel={funnel} />
              <FunnelRow label="→ Scan started (attributed)" field="attributedScanStarts" funnel={funnel} highlight />
              <FunnelRow label="→ Lead captured (attributed)" field="attributedLeads" funnel={funnel} highlight />
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-xs text-zinc-500">
          <RateNote label="Bounce rate (all-time)" value={rate(funnel.allTime.bounced, funnel.allTime.emailsAttempted)} />
          <RateNote label="Open rate (all-time)" value={rate(funnel.allTime.opened, funnel.allTime.delivered || funnel.allTime.emailsAttempted)} />
          <RateNote label="Click rate of opens (all-time)" value={rate(funnel.allTime.clicked, funnel.allTime.opened)} />
        </div>
        <p className="mt-4 text-xs text-zinc-400">
          Not currently measurable and not estimated: pricing-page visits, checkout starts, and paid conversions attributable
          specifically to a cold-outreach click (vs. organic/direct). Stripe is authoritative for payment completion —
          see /admin/mrr.
        </p>
      </section>

      {/* ── SETTINGS PANEL ───────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-1">Pipeline controls</h2>
        <p className="text-sm text-zinc-500 mb-5">Changes take effect on the next worker tick (within 15 min).</p>
        <OutreachSettingsForm current={settings} />
      </section>

      {/* ── TODAY'S TARGET ────────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Today&apos;s targets</h2>
        {isWeekend ? (
          <div>
            <p className="text-sm text-zinc-500 mb-3">Weekend mode — restaurants only:</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {WEEKEND_TARGETS.map((t) => (
                <div key={t.day + t.time} className="rounded-xl border border-orange-100 bg-orange-50 p-3">
                  <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">{t.day} · {t.time}</p>
                  <p className="text-sm font-semibold text-zinc-900 mt-0.5">Restaurants · {t.city}, {t.state}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(["morning", "midday", "afternoon", "evening"] as const).map((windowKey) => {
              const target = getOutreachTargetForOffset(OUTREACH_WINDOW_OFFSETS[windowKey]);
              const labels = { morning: "9am UTC (morning)", midday: "12pm UTC (midday)", afternoon: "3pm UTC (afternoon)", evening: "7pm UTC (evening)" };
              return (
                <div key={windowKey} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">{labels[windowKey]}</p>
                  <p className="text-sm font-semibold text-zinc-900 mt-0.5">{target.industryLabel}s</p>
                  <p className="text-xs text-zinc-500">{target.city}, {target.state}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── CALENDAR ──────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900 mb-3">Weekday calendar (100-slot rotation, ~25 days between repeats per window)</h2>
          <div className="space-y-0.5 max-h-96 overflow-y-auto pr-1">
            {calendar.map((slot) => {
              const today = daysSinceEpoch();
              const isToday =
                !isWeekend &&
                Object.values(OUTREACH_WINDOW_OFFSETS).some(
                  (offset) => (today + offset) % calendar.length === slot.daySlot - 1,
                );
              return (
                <div key={slot.daySlot} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs ${isToday ? "bg-red-50 border border-red-200 font-semibold" : "hover:bg-zinc-50"}`}>
                  <span className={`w-5 text-right shrink-0 ${isToday ? "text-red-700 font-bold" : "text-zinc-400"}`}>{slot.daySlot}</span>
                  <span className="text-zinc-800">{slot.industryLabel}</span>
                  <span className="text-zinc-400 ml-auto shrink-0">{slot.city}, {slot.state}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-3 border-t border-zinc-100">
            <p className="text-xs font-semibold text-zinc-500 mb-1">Weekends — restaurants only</p>
            {WEEKEND_TARGETS.map((t) => (
              <div key={t.day + t.time} className="flex items-center gap-3 text-xs py-1">
                <span className="text-orange-600 font-medium w-20 shrink-0">{t.day} {t.time}</span>
                <span className="text-zinc-700">Restaurants · {t.city}, {t.state}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── BATCH HISTORY ────────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900 mb-3">Recent batches</h2>
          {batches.length === 0 ? (
            <p className="text-sm text-zinc-400">No batches yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
              {batches.map((b) => (
                <div key={b.id} className="py-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">{b.industry} · {b.city}{b.state ? `, ${b.state}` : ""}</span>
                    <span className="text-zinc-400 shrink-0">{new Date(b.ranAt).toLocaleDateString()} {new Date(b.ranAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-emerald-700 font-medium">✓ {b.sent} sent</span>
                    <span className="text-zinc-400">{b.skipped} skipped</span>
                    <span className="text-zinc-400">{b.prospects} prospects found</span>
                    <span className="text-zinc-300">· {b.window}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── SENT EMAIL LOG ───────────────────────────────────── */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-zinc-900">All emails sent</h2>
          <span className="text-xs text-zinc-400">{sentEmails.length} total</span>
        </div>
        {sentEmails.length === 0 ? (
          <p className="text-sm text-zinc-400 py-4">No emails sent yet. Pipeline fires Mon–Fri 9am/12pm/3pm UTC, weekends 9am/1pm UTC.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-zinc-400 uppercase tracking-wide">
                  <th className="pb-2 pr-4 font-semibold">Business</th>
                  <th className="pb-2 pr-4 font-semibold">Email sent to</th>
                  <th className="pb-2 pr-4 font-semibold">City</th>
                  <th className="pb-2 pr-4 font-semibold">Industry</th>
                  <th className="pb-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {sentEmails.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-50">
                    <td className="py-2 pr-4 font-medium text-zinc-900">{e.businessName}</td>
                    <td className="py-2 pr-4 text-zinc-500 font-mono">{e.email}</td>
                    <td className="py-2 pr-4 text-zinc-500">{e.city}</td>
                    <td className="py-2 pr-4 text-zinc-500">{e.industry || "—"}</td>
                    <td className="py-2 text-zinc-400 whitespace-nowrap">
                      {new Date(e.sentAt).toLocaleDateString()} {new Date(e.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── SETUP NOTE ───────────────────────────────────────── */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-semibold text-amber-900 mb-2">📧 Sender email setup</p>
        <p className="text-sm text-amber-800 leading-relaxed">
          Cold emails send from <strong>{process.env.RESEND_FROM_EMAIL ?? "hello@gravyblock.com"}</strong>.
          For best deliverability with cold outreach, set <code className="bg-amber-100 px-1 rounded text-xs">RESEND_FROM_EMAIL</code> to a
          personal-looking address like <strong>chris@gravyblock.com</strong> and make sure
          SPF, DKIM, and DMARC are configured for gravyblock.com in Resend's domain settings.
          A personal sender name gets significantly higher open rates than a brand name.
        </p>
      </section>
    </div>
  );
}

function rate(numerator: number, denominator: number): string {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function RateNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="font-semibold text-zinc-600">{label}</p>
      <p className="mt-0.5 text-base font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function FunnelRow({
  label,
  field,
  funnel,
  highlight,
  warn,
}: {
  label: string;
  field: keyof FunnelPeriodStats;
  funnel: { today: FunnelPeriodStats; last7d: FunnelPeriodStats; last30d: FunnelPeriodStats; allTime: FunnelPeriodStats };
  highlight?: boolean;
  warn?: boolean;
}) {
  const cls = highlight ? "font-semibold text-zinc-900" : warn ? "text-amber-700" : "text-zinc-700";
  return (
    <tr>
      <td className={`py-2 pr-4 ${highlight ? "font-semibold text-zinc-900" : "text-zinc-600"}`}>{label}</td>
      <td className={`py-2 pr-4 text-right tabular-nums ${cls}`}>{funnel.today[field].toLocaleString()}</td>
      <td className={`py-2 pr-4 text-right tabular-nums ${cls}`}>{funnel.last7d[field].toLocaleString()}</td>
      <td className={`py-2 pr-4 text-right tabular-nums ${cls}`}>{funnel.last30d[field].toLocaleString()}</td>
      <td className={`py-2 text-right tabular-nums ${cls}`}>{funnel.allTime[field].toLocaleString()}</td>
    </tr>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${highlight ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-emerald-800" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
