import type { Metadata } from "next";
import Link from "next/link";
import { inArray } from "drizzle-orm";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { METRIC_KEYS, mergeSets, type MetricSet } from "@/lib/marketing-studio/measurement/metrics";
import { learningReport } from "@/lib/marketing-studio/measurement/learning";
import { listProducts } from "@/lib/marketing-studio/repository";
import { collectMetricsAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Studio insights", robots: { index: false, follow: false } };

const badge = (s: string) => (s === "confirmed" ? "bg-emerald-100 text-emerald-800" : s === "estimated" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600");
const LABEL: Record<string, string> = { impressions: "Impressions", views: "Views", reach: "Reach", reactions: "Reactions", comments: "Comments", shares: "Shares", link_clicks: "Link clicks", video_watch_seconds: "Watch seconds", avg_watch_seconds: "Avg watch s", site_visits: "Site visits", conversions: "Conversions" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { scope } = await requireStudioAccess();
  const q = await searchParams;
  const db = requireStudioDb();
  const products = await listProducts(scope, db);
  const ids = products.map((p) => p.id);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const pubs = ids.length ? (await db.select().from(ms.msPublications).where(inArray(ms.msPublications.productId, ids))).filter((p) => p.status === "published") : [];
  const snaps = pubs.length ? await db.select().from(ms.msPublicationMetrics).where(inArray(ms.msPublicationMetrics.publicationId, pubs.map((p) => p.id))).orderBy(ms.msPublicationMetrics.collectedAt) : [];
  const report = await learningReport(scope, db);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/marketing-studio" className="text-xs text-zinc-500 underline">
          ← Marketing Studio
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Insights</h1>
        <p className="text-sm text-zinc-600">
          Every number is labelled <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge("confirmed")}`}>CONFIRMED</span> (reported by the platform), <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge("estimated")}`}>ESTIMATED</span> (inferred) or{" "}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge("unknown")}`}>UNKNOWN</span> (not available, never shown as zero).
        </p>
        {q.e ? <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">{q.e}</p> : null}
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Published posts</h2>
        {pubs.length === 0 ? <p className="mt-2 text-sm text-zinc-500">Nothing has been published, so there is nothing to measure yet.</p> : null}
        {pubs.map((p) => {
          const m = mergeSets(snaps.filter((s) => s.publicationId === p.id).map((s) => s.metrics as MetricSet));
          const last = snaps.filter((s) => s.publicationId === p.id).at(-1);
          return (
            <div key={p.id} className="mt-4 border-t border-zinc-100 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  <strong>{names.get(p.productId)}</strong> on {p.platform}, published {p.publishedAt?.toISOString().slice(0, 16).replace("T", " ")} UTC
                  {p.externalUrl ? (
                    <a className="ml-2 underline" href={p.externalUrl}>
                      open post
                    </a>
                  ) : null}
                  <span className="block text-zinc-500">{last ? `last collected ${last.collectedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : "not collected yet"}</span>
                </span>
                <form action={collectMetricsAction}>
                  <input type="hidden" name="productId" value={p.productId} />
                  <input type="hidden" name="publicationId" value={p.id} />
                  <button className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">Collect now</button>
                </form>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {METRIC_KEYS.map((k) => (
                  <div key={k} className="rounded-lg border border-zinc-100 p-2" title={m[k].note ?? ""}>
                    <div className="text-zinc-500">{LABEL[k]}</div>
                    <div className="text-sm font-semibold text-zinc-900">{m[k].value === null ? "unknown" : m[k].value}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badge(m[k].status)}`}>{m[k].status}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">What the evidence says</h2>
        <p className="mt-1 text-xs text-zinc-500">
          {report.measuredObservations} of {report.observations} published posts have confirmed numbers. {report.caveat}
        </p>
        <ul className="mt-3 space-y-2 text-sm text-zinc-800">
          {report.recommendations.map((r) => (
            <li key={r.dimension}>
              <strong className="capitalize">{r.dimension}:</strong> {r.text}
            </li>
          ))}
        </ul>
        {report.unknowns.map((u) => (
          <p key={u} className="mt-2 text-xs text-amber-800">
            {u}
          </p>
        ))}
        <p className="mt-3 text-xs text-zinc-500">These are recommendations only. Nothing here publishes anything.</p>
      </section>
    </div>
  );
}
