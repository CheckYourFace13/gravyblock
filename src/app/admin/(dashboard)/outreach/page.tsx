import type { Metadata } from "next";
import { getOutreachSettings, getSentEmails, getBatchHistory, getOutreachCounts } from "./actions";
import { getCalendarPreview, getTodaysOutreachTarget } from "@/lib/outreach/outreach-calendar";
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
  const [settings, sentEmails, batches, counts] = await Promise.all([
    getOutreachSettings(),
    getSentEmails(200),
    getBatchHistory(30),
    getOutreachCounts(),
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
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 10, 20].map((offset, i) => {
              const slot = ((now.getUTCDate() - 1 + offset) % 30);
              const target = calendar[slot]!;
              const labels = ["9am UTC (morning)", "12pm UTC (midday)", "3pm UTC (afternoon)"];
              return (
                <div key={offset} className="rounded-xl border border-red-100 bg-red-50 p-3">
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wide">{labels[i]}</p>
                  <p className="text-sm font-semibold text-zinc-900 mt-0.5">{target.industryLabel}s</p>
                  <p className="text-xs text-zinc-500">{target.city}, {target.state}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── 30-DAY CALENDAR ──────────────────────────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900 mb-3">Weekday calendar (30-day rotation)</h2>
          <div className="space-y-0.5 max-h-96 overflow-y-auto pr-1">
            {calendar.map((slot) => {
              const isToday = !isWeekend && ((now.getUTCDate() - 1) % 30) === (slot.daySlot - 1);
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

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${highlight ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-emerald-800" : "text-zinc-900"}`}>{value}</p>
    </div>
  );
}
