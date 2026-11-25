import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLatestReport } from "@/lib/search-intel";
import { deriveImprovements } from "@/lib/search-intel/prompt";
import type { Move } from "@/lib/search-intel/analysis";
import { CopyPrompt } from "../copy-prompt";

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
  const improvements = deriveImprovements(d);
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

      <section className="rounded-xl border border-red-200 bg-red-50 p-4">
        <h2 className="mb-2 text-base font-semibold text-zinc-900">Development instruction (one prompt)</h2>
        <CopyPrompt prompt={r.prompt} />
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

      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold text-zinc-900">The improvements in the prompt</h2>
        {improvements.length ? improvements.map((i, n) => <p key={n}>{n + 1}. <b>{i.title}</b> ({i.kind.replace(/_/g, " ")}{i.potentialClicks28 > 0 ? `, up to ~${i.potentialClicks28} clicks per 28 days` : ""})</p>) : <p className="text-zinc-500">Not enough evidence for a specific change; the prompt asks for validation work instead.</p>}
      </section>
    </div>
  );
}
