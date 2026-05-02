"use client";

import { useState, useTransition } from "react";
import { fetchTopicClusters } from "./topic-cluster-actions";
import type { TopicCluster } from "@/lib/content/topic-clusters";

type Props = { businessId: string };

const STATUS_COLORS = {
  published: "bg-green-100 text-green-800",
  queued: "bg-blue-100 text-blue-800",
  gap: "bg-zinc-100 text-zinc-500",
};

export function TopicClusterSection({ businessId }: Props) {
  const [clusters, setClusters] = useState<TopicCluster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await fetchTopicClusters(businessId);
      if (result.ok && result.clusters) {
        setClusters(result.clusters);
      } else {
        setError(result.error ?? "Failed to generate cluster map.");
      }
    });
  }

  const gapCount = clusters?.flatMap((c) => c.articles).filter((a) => a.status === "gap").length ?? 0;
  const publishedCount = clusters?.flatMap((c) => c.articles).filter((a) => a.status === "published").length ?? 0;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Topic cluster map</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            Your content strategy organized by pillar topic — see what&apos;s published, what&apos;s queued, and what gaps autopilot should fill next.
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={isPending}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {isPending ? "Generating…" : clusters ? "Regenerate map" : "Generate cluster map"}
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {!clusters && !isPending ? (
        <div className="mt-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-5 py-8 text-center text-sm text-zinc-500">
          Click &ldquo;Generate cluster map&rdquo; to see your content strategy — pillar topics, supporting articles, and content gaps autopilot will fill.
        </div>
      ) : isPending ? (
        <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 px-5 py-8 text-center text-sm text-zinc-500 animate-pulse">
          Analyzing your content and building the cluster map…
        </div>
      ) : clusters ? (
        <>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">{publishedCount} published</span>
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">{clusters.flatMap((c) => c.articles).filter((a) => a.status === "queued").length} queued</span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">{gapCount} gaps — autopilot will fill these</span>
          </div>

          <div className="mt-5 space-y-5">
            {clusters.map((cluster, i) => (
              <div key={i} className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Pillar</span>
                  <div>
                    <p className="font-semibold text-zinc-900">{cluster.pillar}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">keyword: {cluster.keyword}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {cluster.articles.map((article, j) => (
                    <li key={j} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-zinc-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-800">{article.title}</p>
                        <p className="text-xs text-zinc-400">{article.keyword}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[article.status]}`}>
                        {article.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
