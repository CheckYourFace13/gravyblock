import type { LocalRankingSummary } from "@/lib/report/types";

/**
 * Report panels built ONLY from data a scan or probe actually stored. Nothing here invents a position, a score or a
 * map: where the data is a single estimate per query it is shown as a single labeled estimate.
 */

export type AiProbeRow = {
  engine: string;
  prompt: string;
  mentionFound: string;
  citationUrl: string | null;
  sentiment: string | null;
  createdAt: string;
};

export type AiProbeSummary = {
  total: number;
  mentioned: number;
  byEngine: Record<string, { total: number; mentioned: number }>;
  recent: AiProbeRow[];
};

const ENGINE_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT-style model (gpt-4o-mini)",
  perplexity: "Perplexity",
  copilot: "Second ChatGPT-style probe (different prompt angle)",
};

function engineLabel(engine: string) {
  return ENGINE_LABEL[engine] ?? engine.replaceAll("_", " ");
}

function probeResult(v: string): { label: string; className: string } {
  if (v === "true") return { label: "Mentioned", className: "bg-emerald-100 text-emerald-800" };
  if (v === "false") return { label: "Not mentioned", className: "bg-zinc-100 text-zinc-700" };
  return { label: "Inconclusive", className: "bg-amber-100 text-amber-800" };
}

/** One estimated position per sampled query, with the businesses sampled beside it. Never a geo-grid. */
export function MapsVisibilitySnapshot({ summary, businessName }: { summary: LocalRankingSummary | null; businessName: string }) {
  if (!summary || summary.checks.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Maps visibility snapshot</h2>
        <p className="mt-2 text-sm text-zinc-600">No local search queries were sampled for this scan, so there is no Maps position to show.</p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Maps visibility snapshot</h2>
      <p className="mt-1 text-sm text-zinc-600">
        One estimated position for each sampled search, from Google Places results. This is not a rank-tracking grid and it does not
        show how you rank from different locations.
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {summary.checks.map((check) => {
          const sampled = [...check.competitors].sort((a, b) => a.position - b.position).slice(0, 5);
          return (
            <article key={check.query} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Search sampled</p>
              <p className="font-semibold text-zinc-900">{check.query}</p>
              <p className="mt-2 text-zinc-800">
                {check.estimatedPosition ? (
                  <>
                    <span className="text-2xl font-semibold">#{check.estimatedPosition}</span>{" "}
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">estimated position</span>
                  </>
                ) : (
                  <span className="font-semibold">{businessName} was not in the sampled results</span>
                )}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                Map pack: {check.inMapPack ? "inside the top results" : "not inside the top results"} · confidence {check.confidence}% · estimate, not a verified
                rank
              </p>
              {sampled.length ? (
                <ol className="mt-3 space-y-1 text-xs text-zinc-700">
                  {sampled.map((c) => (
                    <li key={c.placeId} className="flex justify-between gap-3">
                      <span className="truncate">
                        {c.position}. {c.name}
                      </span>
                      <span className="shrink-0 text-zinc-500">
                        {c.rating != null ? `${c.rating}★` : "no rating"}
                        {c.reviewCount != null ? ` · ${c.reviewCount} reviews` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </article>
          );
        })}
      </div>
      {summary.note ? <p className="mt-3 text-xs text-zinc-500">{summary.note}</p> : null}
    </section>
  );
}

/** Real AI answer probes only. Mentioned, not mentioned, or inconclusive. No invented score. */
export function AiVisibilityPanel({ probes }: { probes: AiProbeSummary | null }) {
  if (!probes || probes.total === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">AI answer visibility</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Not checked yet. AI answer probes run once GravyBlock is working on a business, so this free report has no AI results and
          shows none rather than guessing.
        </p>
      </section>
    );
  }
  const engines = Object.entries(probes.byEngine);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">AI answer visibility</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Questions a customer might ask an AI assistant, and whether the answer mentioned this business. Counts are real probe results,
        not a score.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {engines.map(([engine, s]) => (
          <div key={engine} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{engineLabel(engine)}</p>
            <p className="mt-1 text-zinc-900">
              <span className="text-2xl font-semibold">{s.mentioned}</span> of {s.total} probes mentioned the business
            </p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {probes.recent.slice(0, 6).map((p, i) => {
          const r = probeResult(p.mentionFound);
          return (
            <li key={`${p.engine}-${i}`} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.className}`}>{r.label}</span>
                <span className="text-xs text-zinc-500">{engineLabel(p.engine)}</span>
              </div>
              <p className="mt-1 text-zinc-800">{p.prompt}</p>
              {p.citationUrl ? (
                <p className="mt-1 truncate text-xs text-zinc-500">
                  Source cited:{" "}
                  <a href={p.citationUrl} className="underline" target="_blank" rel="noreferrer">
                    {p.citationUrl}
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The sampled competitors from the scan, with plain differences against the scanned business. */
export function CompetitorSnapshot({
  summary,
  businessName,
  rating,
  reviewCount,
}: {
  summary: LocalRankingSummary | null;
  businessName: string;
  rating?: number | null;
  reviewCount?: number | null;
}) {
  const byPlace = new Map<string, { name: string; position: number; rating?: number; reviewCount?: number; queries: number }>();
  for (const check of summary?.checks ?? []) {
    for (const c of check.competitors) {
      const prev = byPlace.get(c.placeId);
      if (!prev) byPlace.set(c.placeId, { name: c.name, position: c.position, rating: c.rating, reviewCount: c.reviewCount, queries: 1 });
      else byPlace.set(c.placeId, { ...prev, position: Math.min(prev.position, c.position), queries: prev.queries + 1 });
    }
  }
  const rows = [...byPlace.values()].sort((a, b) => a.position - b.position).slice(0, 8);
  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Competitor snapshot</h2>
        <p className="mt-2 text-sm text-zinc-600">No nearby competitors were captured in this scan.</p>
      </section>
    );
  }
  const maxReviews = Math.max(1, ...rows.map((r) => r.reviewCount ?? 0), reviewCount ?? 0);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Competitor snapshot</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Businesses that appeared in the sampled searches, with the rating and review count Google listed for each. Positions are estimates
        from the sample.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-semibold">Business</th>
              <th className="py-2 pr-3 font-semibold">Best sampled position</th>
              <th className="py-2 pr-3 font-semibold">Rating</th>
              <th className="py-2 pr-3 font-semibold">Reviews</th>
              <th className="py-2 font-semibold">Review count vs yours</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-red-100 bg-red-50/60">
              <td className="py-2 pr-3 font-semibold text-zinc-900">{businessName} (you)</td>
              <td className="py-2 pr-3 text-zinc-600">see snapshot above</td>
              <td className="py-2 pr-3">{rating != null ? `${rating}★` : "n/a"}</td>
              <td className="py-2 pr-3">{reviewCount != null ? reviewCount : "n/a"}</td>
              <td className="py-2">
                <Bar value={reviewCount ?? 0} max={maxReviews} tone="bg-red-500" />
              </td>
            </tr>
            {rows.map((r) => {
              const diff = r.reviewCount != null && reviewCount != null ? r.reviewCount - reviewCount : null;
              return (
                <tr key={r.name} className="border-t border-zinc-100">
                  <td className="py-2 pr-3 text-zinc-900">{r.name}</td>
                  <td className="py-2 pr-3">#{r.position}</td>
                  <td className="py-2 pr-3">{r.rating != null ? `${r.rating}★` : "n/a"}</td>
                  <td className="py-2 pr-3">
                    {r.reviewCount != null ? r.reviewCount : "n/a"}
                    {diff != null ? <span className="ml-1 text-xs text-zinc-500">({diff >= 0 ? "+" : ""}{diff})</span> : null}
                  </td>
                  <td className="py-2">
                    <Bar value={r.reviewCount ?? 0} max={maxReviews} tone="bg-zinc-400" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="h-2 w-32 rounded-full bg-zinc-100" aria-hidden>
      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
