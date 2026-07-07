import Link from "next/link";
import { getAutopilotOpsSummary, listBrandsOverview, listLocationsOverview } from "@/lib/autopilot/repository";
import { listBusinessSummaries, listLeads, listReportSummaries } from "@/lib/report/repository";
import { getDb, jobs } from "@/lib/db";
import { and, gte, eq, desc } from "drizzle-orm";
import { getCalendarPreview, getTodaysOutreachTarget } from "@/lib/outreach/outreach-calendar";

async function getOutreachStats() {
  const db = getDb();
  if (!db) return { sentThisMonth: 0, sentToday: 0, recentJobs: [] as Array<{ createdAt: Date; payload: unknown }> };

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [monthRows, todayRows, recentRows] = await Promise.all([
    db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.type, "cold_outreach_batch"), gte(jobs.createdAt, monthStart))),
    db.select({ id: jobs.id }).from(jobs)
      .where(and(eq(jobs.type, "cold_outreach_batch"), gte(jobs.createdAt, todayStart))),
    db.select({ createdAt: jobs.createdAt, payload: jobs.payload }).from(jobs)
      .where(eq(jobs.type, "cold_outreach_batch"))
      .orderBy(desc(jobs.createdAt))
      .limit(10),
  ]);

  // Count individual emails sent (each batch sends up to 3)
  const sentThisMonth = monthRows.length * 3;
  const sentToday = todayRows.length > 0 ? 3 : 0;

  return { sentThisMonth, sentToday, recentJobs: recentRows };
}

export const dynamic = "force-dynamic";

const panels: { href: string; title: string; description: string }[] = [
  { href: "/admin/leads", title: "Leads", description: "Inbound contacts, pipeline, and sources." },
  { href: "/admin/businesses", title: "Businesses", description: "Scanned entities — open a row for social signals, rankings, and workspace." },
  { href: "/admin/brands", title: "Brands", description: "Brand rollups for multi-location accounts." },
  { href: "/admin/locations", title: "Locations", description: "Physical and service-area locations tied to brands." },
  { href: "/admin/reports", title: "Reports", description: "Public report links and scores across scans." },
  { href: "/admin/autopilot", title: "Autopilot", description: "Queues, jobs, and operator-facing automation status." },
  { href: "/admin/mrr", title: "MRR", description: "Monthly recurring revenue, plan breakdown, and active subscribers." },
];

export default async function AdminHomePage() {
  const [reports, leads, businesses, brands, locations, autopilot, outreach] = await Promise.all([
    listReportSummaries(),
    listLeads(),
    listBusinessSummaries(),
    listBrandsOverview(),
    listLocationsOverview(),
    getAutopilotOpsSummary(),
    getOutreachStats(),
  ]);

  const todaysTarget = getTodaysOutreachTarget();
  const calendar = getCalendarPreview();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Live snapshot of what GravyBlock has stored. Use the sidebar (or menu on small screens) to jump anywhere.
          Social discovery and per-scan detail live under each business.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {panels.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
          >
            <p className="text-sm font-semibold text-red-800">{p.title}</p>
            <p className="mt-2 text-sm text-zinc-600">{p.description}</p>
            <p className="mt-3 text-xs font-semibold text-zinc-900">Open →</p>
          </Link>
        ))}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-zinc-900">At a glance</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Businesses" value={String(businesses.length)} />
          <StatCard label="Brands" value={String(brands.length)} />
          <StatCard label="Locations" value={String(locations.length)} />
          <StatCard label="Reports" value={String(reports.length)} />
          <StatCard label="Leads" value={String(leads.length)} />
          <StatCard label="Autopilot · queued tasks" value={String(autopilot.queuedTasks)} />
          <StatCard label="Autopilot · pending jobs" value={String(autopilot.queuedJobs)} />
          <StatCard label="Autopilot · publishing queue" value={String(autopilot.queuedPublishing)} />
          <StatCard label="Autopilot · Base monthly jobs" value={String(autopilot.entryRecurringPending)} />
          <StatCard label="Autopilot · pro recurring jobs" value={String(autopilot.proRecurringPending)} />
          <StatCard label="Autopilot · citation ops" value={String(autopilot.queuedCitationOps)} />
          <StatCard
            label="Avg. score (latest 10 reports)"
            value={
              reports.length
                ? String(
                    Math.round(
                      reports.slice(0, 10).reduce((sum, r) => sum + r.score, 0) / Math.min(reports.length, 10),
                    ),
                  )
                : "—"
            }
          />
        </div>
      </div>

      {/* ── COLD OUTREACH PIPELINE ─────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">🎯 Cold outreach pipeline</h2>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Auto · Mon–Fri 9am UTC · 3 emails/day
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mb-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sent this month</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">~{outreach.sentThisMonth}</p>
            <p className="text-xs text-zinc-400">cold emails dispatched</p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sent today</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{outreach.sentToday > 0 ? "✓ Done" : "Pending"}</p>
            <p className="text-xs text-zinc-400">{outreach.sentToday > 0 ? "batch completed" : "fires at 9am UTC"}</p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Today&apos;s target</p>
            <p className="mt-1 text-base font-bold text-zinc-900">{todaysTarget.industryLabel}s</p>
            <p className="text-xs text-zinc-600">{todaysTarget.city}, {todaysTarget.state}</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {/* 30-day calendar */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">30-day calendar</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {calendar.map((slot) => {
                const isToday = slot.daySlot === new Date().getUTCDate() || (new Date().getUTCDate() > 30 && slot.daySlot === new Date().getUTCDate() % 30);
                return (
                  <div key={slot.daySlot} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 text-xs ${isToday ? "bg-red-50 border border-red-200" : "hover:bg-zinc-50"}`}>
                    <span className={`w-6 text-center font-bold shrink-0 ${isToday ? "text-red-700" : "text-zinc-400"}`}>{slot.daySlot}</span>
                    <span className="font-medium text-zinc-800">{slot.industryLabel}</span>
                    <span className="text-zinc-400 ml-auto shrink-0">{slot.city}, {slot.state}</span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent batches */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Recent batches</h3>
            {outreach.recentJobs.length === 0 ? (
              <p className="text-sm text-zinc-400">No batches run yet. Will start Mon–Fri at 9am UTC.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {outreach.recentJobs.map((job, i) => {
                  const p = job.payload as Record<string, unknown> | null;
                  return (
                    <li key={i} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900">
                          {String(p?.industryLabel ?? p?.industry ?? "—")} · {String(p?.city ?? "—")}, {String(p?.state ?? "—")}
                        </span>
                        <span className="text-zinc-400 shrink-0">{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-zinc-500">
                        {String(p?.sent ?? "?")} sent · {String(p?.skipped ?? "?")} skipped · {String(p?.prospects ?? "?")} prospects found
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent reports</h2>
            <Link href="/admin/reports" className="text-sm font-semibold text-red-700 hover:text-red-800">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {reports.slice(0, 6).map((r) => (
              <li key={r.publicId} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium text-zinc-900">{r.businessName}</p>
                  <p className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Link href={`/report/${r.publicId}`} className="font-semibold text-red-700 hover:underline">
                      Public report
                    </Link>
                    {r.businessId ? (
                      <>
                        <Link href={`/workspace/${r.businessId}`} className="font-semibold text-zinc-600 hover:underline">
                          Workspace
                        </Link>
                        <Link href={`/admin/businesses/${r.businessId}`} className="font-semibold text-amber-700 hover:underline">
                          Manage / house account
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-zinc-900">{r.score}</p>
                  <p className="text-xs uppercase text-zinc-500">{r.opportunityLevel}</p>
                </div>
              </li>
            ))}
            {!reports.length ? <li className="py-6 text-sm text-zinc-500">No reports yet.</li> : null}
          </ul>
        </section>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">Recent leads</h2>
            <Link href="/admin/leads" className="text-sm font-semibold text-red-700 hover:text-red-800">
              View all
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-zinc-100">
            {leads.slice(0, 6).map((lead) => (
              <li key={lead.id} className="py-3 text-sm">
                <p className="font-medium text-zinc-900">{lead.name}</p>
                <p className="text-xs text-zinc-500">{lead.email}</p>
              </li>
            ))}
            {!leads.length ? <li className="py-6 text-sm text-zinc-500">No leads yet.</li> : null}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
