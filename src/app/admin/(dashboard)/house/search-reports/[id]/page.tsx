import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLatestReport } from "@/lib/search-intel";
import { buildPrompt } from "@/lib/search-intel/prompt";
import { loadEvents, loadQueue, unresolvedImprovements, type RecRecord } from "@/lib/search-intel/recommendations";
import { loadDeliveries } from "@/lib/search-intel/grokbot";
import { STATUS_LABEL } from "@/lib/search-intel/recommendation-model";
import type { Move } from "@/lib/search-intel/analysis";
import { CopyPrompt, OpenedBeacon, StatusButtons, VerifyNowButton } from "../copy-prompt";

const BADGE: Record<string, string> = { new: "bg-sky-100 text-sky-800", opened: "bg-indigo-100 text-indigo-800", in_progress: "bg-amber-100 text-amber-800", completed: "bg-violet-100 text-violet-800", verified: "bg-emerald-100 text-emerald-800", dismissed: "bg-zinc-200 text-zinc-600" };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

type Sent = { status: string; sentAt: string | null; occurrence: number; error: string | null };
function RecCard({ rec, events, businessId, sent }: { rec: RecRecord; sent?: Sent; events: Array<{ at: string; type: string; from: string | null; to: string | null; note: string | null }>; businessId: string }) {
  const imp = rec.improvement;
  return (
    <div className="space-y-1.5 rounded-lg border border-zinc-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${BADGE[rec.status]}`}>{STATUS_LABEL[rec.status]}</span>
        {rec.copiedAt ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">Handed off {day(rec.copiedAt)}{rec.copyCount > 1 ? ` (x${rec.copyCount})` : ""}</span> : null}
        {sent ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sent.status === "sent" ? "bg-teal-100 text-teal-800" : sent.status === "failed" ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-700"}`}>{sent.status === "sent" ? `Sent to GrokBot ${sent.sentAt?.slice(0, 10)} (occurrence ${sent.occurrence})` : sent.status === "failed" ? `GrokBot email failed, retrying: ${sent.error ?? ""}` : `GrokBot email ${sent.status}`}</span> : null}
        {rec.occurrence > 1 ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Reopened, occurrence {rec.occurrence}</span> : null}
        <span className="font-mono text-xs text-zinc-500">{rec.ref}</span>
        <span className="text-xs text-zinc-500">first reported {day(rec.firstSeenAt)}{rec.openedAt ? `, opened ${day(rec.openedAt)}` : ""}{rec.inProgressAt && rec.status === "in_progress" ? `, started ${day(rec.inProgressAt)}` : ""}{rec.completedAt ? `, completed ${day(rec.completedAt)}` : ""}{rec.verifiedAt ? `, verified ${day(rec.verifiedAt)}` : ""}</span>
      </div>
      <p className="font-medium text-zinc-900">{rec.title}</p>
      {imp.urls.length ? <p className="break-all text-xs text-zinc-600">{imp.urls.slice(0, 3).join(" · ")}</p> : null}
      <p className="text-xs text-zinc-700">{imp.evidence[0]}</p>
      {rec.verification ? (
        <p className={`text-xs ${rec.verification.deployed ? "text-emerald-700" : "text-amber-700"}`}>
          Live check {rec.verification.at.slice(0, 10)}: {rec.verification.note}
          {rec.verification.checks.slice(0, 3).map((c, i) => <span key={i} className="block break-all">{c.pass ? "pass" : "not yet"}: {c.check} ({c.url}: {c.after})</span>)}
        </p>
      ) : null}
      {rec.outcome ? <p className="text-xs text-zinc-700">Search outcome ({rec.outcome.measuredAt.slice(0, 10)}): <b>{rec.outcome.verdict.replace(/_/g, " ")}</b>{rec.outcome.before && rec.outcome.after ? `, ${rec.outcome.before.clicks} to ${rec.outcome.after.clicks} clicks over equal 28-day windows` : ""}. {rec.outcome.note}</p> : null}
      <StatusButtons businessId={businessId} recommendationId={rec.id} status={rec.status} />
      <details className="text-xs text-zinc-600">
        <summary className="cursor-pointer">History ({events.length})</summary>
        <ul className="mt-1 space-y-0.5">{events.map((e, i) => <li key={i}>{e.at.slice(0, 16).replace("T", " ")} · {e.type}{e.from || e.to ? ` (${e.from ?? "-"} to ${e.to ?? "-"})` : ""}{e.note ? ` · ${e.note}` : ""}</li>)}</ul>
      </details>
    </div>
  );
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Site search and competitor report" };

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const UUID = /^[0-9a-f-]{36}$/i;

function MoveTable({ title, rows, unit }: { title: string; rows: Move[]; unit: string }) {
  return (
    <div>
      <h4 className="mt-2 text-xs font-semibold uppercase text-zinc-500">{title}</h4>
      {rows.length === 0 ? <p className="text-zinc-500">None with enough volume.</p> : (
        <ul className="space-y-0.5">
          {rows.map((m) => (
            <li key={m.key} className="break-all"><span className="font-medium">{m.key}</span> clicks {m.clicksPrev} to {m.clicksCur}, {unit} {m.imprPrev} to {m.imprCur}{m.posCur !== null ? `, position ${m.posCur.toFixed(1)}${m.posPrev !== null ? ` (was ${m.posPrev.toFixed(1)})` : ""}` : ""}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function SiteSearchReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const r = await loadLatestReport(id); // house accounts only: loadLatestReport refuses any other account type
  if (!r) notFound();
  const d = r.data;
  const now = new Date();
  const queue = await loadQueue(id);
  const events = await loadEvents(queue.map((q) => q.id));
  const deliveries = await loadDeliveries(id);
  // The prompt covers UNRESOLVED work only (new, opened, in progress), so completed, verified and dismissed items never come back in it.
  const unresolved = unresolvedImprovements(queue, now);
  const prompt = buildPrompt(d, unresolved);
  const promptIds = unresolved.map((u) => queue.find((q) => q.ref === u.ref)?.id).filter((x): x is string => !!x);
  const group = (...s: string[]) => queue.filter((q) => s.includes(q.status));
  const cmp = (c: typeof d.w7, label: string) =>
    c ? (
      <p>
        <b>{label}</b> ({c.cur.start} to {c.cur.end}): {c.cur.clicks} clicks ({sign(c.clicksChange)} vs {c.prev.start} to {c.prev.end}), {c.cur.impressions} impressions ({sign(c.impressionsChange)}), CTR {c.cur.ctr === null ? "n/a" : `${(c.cur.ctr * 100).toFixed(1)}%`}, average position {c.cur.position ?? "n/a"}.{" "}
        {c.sample !== "ok" ? <span className="text-amber-700">Sample: {c.sample}. Do not read a trend from this.</span> : null}
      </p>
    ) : <p><b>{label}</b>: unavailable.</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6 text-sm text-zinc-800">
      <p><Link href="/admin/house/search-reports" className="text-red-800 underline">All site reports</Link></p>
      <h1 className="text-xl font-semibold text-zinc-900">{r.name}: search and competitor report, week ending {r.weekEnding}</h1>
      <p className="text-zinc-600">{d.site.website} · generated {r.createdAt.slice(0, 16).replace("T", " ")} UTC · Google clicks and impressions only, never total visitors · read only, GravyBlock does not edit this site.</p>

      <OpenedBeacon businessId={id} weekEnding={r.weekEnding} />
      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">Development instruction (one prompt, unresolved work only)</h2>
        <CopyPrompt prompt={prompt} businessId={id} recommendationIds={promptIds} />
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900">Recommendations and their status</h2>
          <VerifyNowButton businessId={id} />
        </div>
        <p className="text-xs text-zinc-600">Statuses persist across weekly reports. Opening this page marks new items Opened (a view, not work started). Copying the prompt marks items Handed off without changing their status. Verified means a read-only check of the live page confirmed the fix is deployed; any search result is measured separately and never assumed.</p>
        <h3 className="text-xs font-semibold uppercase text-zinc-500">To do ({group("new", "opened", "in_progress").length})</h3>
        {group("new", "opened", "in_progress").length ? group("new", "opened", "in_progress").map((q) => <RecCard key={q.id} rec={q} events={events.get(q.id) ?? []} businessId={id} sent={deliveries.get(q.id)} />) : <p className="text-zinc-500">Nothing unresolved.</p>}
        <h3 className="text-xs font-semibold uppercase text-zinc-500">Completed, awaiting verification ({group("completed").length})</h3>
        {group("completed").map((q) => <RecCard key={q.id} rec={q} events={events.get(q.id) ?? []} businessId={id} sent={deliveries.get(q.id)} />)}
        <h3 className="text-xs font-semibold uppercase text-zinc-500">Verified ({group("verified").length})</h3>
        {group("verified").map((q) => <RecCard key={q.id} rec={q} events={events.get(q.id) ?? []} businessId={id} sent={deliveries.get(q.id)} />)}
        <details><summary className="cursor-pointer text-xs font-semibold uppercase text-zinc-500">Dismissed ({group("dismissed").length})</summary><div className="mt-2 space-y-2">{group("dismissed").map((q) => <RecCard key={q.id} rec={q} events={events.get(q.id) ?? []} businessId={id} sent={deliveries.get(q.id)} />)}</div></details>
      </section>

      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Data quality and what changed</h2>
        <p>Search Console: {d.googleConnected ? "connected" : "NOT connected"}; data status <b>{d.status.status}</b>{d.status.latestDay ? ` (newest day ${d.status.latestDay})` : ""}.</p>
        {[...d.status.notes, ...d.dataQualityNotes].map((n, i) => <p key={i} className="text-amber-700">{n}</p>)}
        {d.changes.map((c, i) => <p key={i}>{c}</p>)}
        {d.seasonal ? <p>Seasonality: {d.seasonal.note}</p> : null}
      </section>

      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Performance</h2>
        {cmp(d.w7, "Latest 7 days")}
        {cmp(d.w28, "Latest 28 days")}
        {d.queries7 ? <><MoveTable title="Rising queries, 7 days" rows={d.queries7.rising} unit="impressions" /><MoveTable title="Declining queries, 7 days" rows={d.queries7.declining} unit="impressions" /></> : null}
        {d.queries28 ? <><MoveTable title="Rising queries, 28 days" rows={d.queries28.rising} unit="impressions" /><MoveTable title="Declining queries, 28 days" rows={d.queries28.declining} unit="impressions" /></> : null}
        {d.pages28 ? <><MoveTable title="Pages gaining visibility, 28 days" rows={d.pages28.rising} unit="impressions" /><MoveTable title="Pages losing visibility, 28 days" rows={d.pages28.declining} unit="impressions" /></> : null}
        {d.pages7 ? <><MoveTable title="Pages gaining, 7 days" rows={d.pages7.rising} unit="impressions" /><MoveTable title="Pages losing, 7 days" rows={d.pages7.declining} unit="impressions" /></> : null}
      </section>

      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Opportunities from rankings</h2>
        <h4 className="text-xs font-semibold uppercase text-zinc-500">High impressions, low CTR</h4>
        {d.lowCtr.length ? <ul>{d.lowCtr.map((l, i) => <li key={i} className="break-all">{l.page} for &quot;{l.query}&quot;: position {l.position}, {l.impressions} impressions, CTR {(l.ctr * 100).toFixed(1)}% (about {(l.expected * 100).toFixed(1)}% is normal), up to ~{l.clicksMissing} clicks</li>)}</ul> : <p className="text-zinc-500">None.</p>}
        {d.bands ? (["b4_10", "b11_20", "b21_40"] as const).map((k) => (
          <div key={k}>
            <h4 className="mt-2 text-xs font-semibold uppercase text-zinc-500">Queries in positions {k === "b4_10" ? "4 to 10" : k === "b11_20" ? "11 to 20" : "21 to 40"}</h4>
            {d.bands![k].length ? <ul>{d.bands![k].map((b, i) => <li key={i} className="break-all">&quot;{b.query}&quot; position {b.position}, {b.impressions} impressions, {b.clicks} clicks, page {b.page}</li>)}</ul> : <p className="text-zinc-500">None with enough impressions.</p>}
          </div>
        )) : null}
      </section>

      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Indexing</h2>
        {d.indexing.dropped ? <p>{d.indexing.dropped.lost} of {d.indexing.dropped.before} pages that earned impressions earlier earn none now (impressions {d.indexing.dropped.impressionsBefore} to {d.indexing.dropped.impressionsNow}).</p> : d.indexing.notes.map((n, i) => <p key={i} className="text-zinc-500">{n}</p>)}
        {d.indexing.rechecks.map((c, i) => <p key={i}>Google URL Inspection {c.at.slice(0, 10)}: {Object.entries(c.verdicts).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ")}</p>)}
      </section>

      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">Competitors (public pages observed {d.competitors.observedAt.slice(0, 10)})</h2>
        <p className="text-zinc-600">A competitor &quot;covers a topic&quot; when it publishes a page about it. That is not a ranking, and GravyBlock has no source for competitor traffic or backlinks.</p>
        <p>Known competitors: {d.competitors.known.length ? d.competitors.known.map((k) => k.website).join(", ") : "none on record"}. Sitemaps read: {d.competitors.sitemapsRead}; pages observed: {d.competitors.pagesObserved}.</p>
        {d.competitors.notes.map((n, i) => <p key={i} className="text-zinc-500">{n}</p>)}
        {d.competitors.newPages.length ? <div><h4 className="text-xs font-semibold uppercase text-zinc-500">Pages first observed since the previous observation</h4><ul>{d.competitors.newPages.map((p, i) => <li key={i} className="break-all">{p.url} (first seen {p.firstSeen.slice(0, 10)})</li>)}</ul></div> : <p className="text-zinc-500">No competitor page was newly observed this week (or this was the baseline run, when no change can be claimed).</p>}
        {d.competitors.queries.map((q, i) => (
          <div key={i} className="rounded-lg border border-zinc-100 p-3">
            <p className="font-medium">&quot;{q.query}&quot; ({q.impressions} impressions, position {q.position})</p>
            <p className="break-all text-zinc-600">Our page: {q.ourPage ? `${q.ourPage.url} (${q.ourPage.words} words, ${q.ourPage.h2s} sections)` : "not compared"}</p>
            {q.competitorPages.map((c, j) => <p key={j} className="break-all">Competitor: {c.url} (title &quot;{c.title}&quot;, {c.words} words, {c.h2s} sections{c.hasTool ? ", interactive tool" : ""}{c.hasFaqSchema ? ", FAQ markup" : ""}{c.tables ? `, ${c.tables} table(s)` : ""}{c.hasVideo ? ", video" : ""}; observed {c.observedAt.slice(0, 10)})</p>)}
            {q.gaps.map((g, j) => <p key={j} className="break-all text-amber-800">Visible difference: {g.evidence}</p>)}
          </div>
        ))}
        <p className="text-zinc-600">{d.authority.note} Outreach: {d.authority.qualified} prospects qualified, {d.authority.contacted} contacted, {d.authority.verifiedLinks} verified links.</p>
      </section>

    </div>
  );
}
