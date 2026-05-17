"use client";

import { useTransition, useState } from "react";
import { runCitationCheckAction } from "./ai-citation-actions";

type RecentCheck = {
  engine: string;
  mentionFound: string;
  prompt: string;
  sentiment: string | null;
  createdAt: Date;
};

type AiCitationStats = {
  total: number;
  mentioned: number;
  byEngine: Record<string, { total: number; mentioned: number }>;
  recentChecks?: RecentCheck[];
};

type Props = {
  stats: AiCitationStats;
  businessId: string;
  businessName: string;
  canRunCheck: boolean;
};

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  gemini: "Llama 3.1",
  llama: "Meta Llama",
  mistral: "Mistral AI",
};

const ALL_ENGINES = ["gemini", "llama", "mistral"];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getMentionRateColor(rate: number, total: number): string {
  if (total === 0) return "text-zinc-400";
  if (rate >= 50) return "text-green-600";
  if (rate >= 25) return "text-yellow-600";
  return "text-red-600";
}

export function AiCitationSection({ stats, businessId, canRunCheck }: Props) {
  const [isPending, startTransition] = useTransition();
  const [checkDone, setCheckDone] = useState(false);

  const mentionRate = stats.total === 0 ? 0 : Math.round((stats.mentioned / stats.total) * 100);
  const rateColor = getMentionRateColor(mentionRate, stats.total);

  function handleRunCheck() {
    startTransition(async () => {
      await runCitationCheckAction(businessId);
      setCheckDone(true);
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-zinc-900">AI Citation Monitor</h2>
        <p className="text-sm text-zinc-500">
          Tracks whether AI assistants like ChatGPT and Perplexity recommend your business when local customers ask for recommendations.
        </p>
      </div>

      {/* Overall citation score */}
      <div className="mt-5 flex items-center gap-4">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-4 text-center">
          <span className={`text-4xl font-bold tabular-nums ${rateColor}`}>
            {stats.total === 0 ? "—" : `${mentionRate}%`}
          </span>
          <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">AI mention rate</span>
          <span className="mt-0.5 text-xs text-zinc-400">
            {stats.total === 0 ? "No checks run yet" : `across ${stats.total} AI queries`}
          </span>
        </div>

        {/* Engine breakdown */}
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:gap-3">
          {ALL_ENGINES.map((engine) => {
            const engineData = stats.byEngine[engine];
            const displayName = ENGINE_DISPLAY_NAMES[engine] ?? capitalize(engine);
            return (
              <div
                key={engine}
                className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
              >
                <p className="text-xs font-semibold text-zinc-700">{displayName}</p>
                {engineData ? (
                  <>
                    <p className="mt-1 text-sm font-semibold text-zinc-900">
                      {engineData.mentioned}/{engineData.total}
                    </p>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-zinc-200">
                      <div
                        className="h-1.5 rounded-full bg-zinc-700"
                        style={{
                          width: `${engineData.total === 0 ? 0 : Math.round((engineData.mentioned / engineData.total) * 100)}%`,
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-zinc-400">Not yet checked</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* What this means callout */}
      <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-sm text-zinc-700">
          AI search tools like ChatGPT and Perplexity answer local questions by summarizing businesses they can find and verify online. A higher mention rate means your business is more likely to be recommended when a potential customer asks an AI assistant for help.
        </p>
        <a
          href="/guides/how-to-show-up-in-ai-search-for-local-businesses"
          className="mt-2 inline-block text-sm font-semibold text-red-800 hover:text-red-900"
        >
          See how to improve your AI visibility &rarr;
        </a>
      </div>

      {/* Recent probe results */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-zinc-800">Recent probe results</p>
        {(stats.recentChecks ?? []).length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-100">
            {(stats.recentChecks ?? []).slice(0, 6).map((check, i) => {
              const mentioned = check.mentionFound === "true";
              const engineName = ENGINE_DISPLAY_NAMES[check.engine] ?? capitalize(check.engine);
              const truncatedPrompt =
                check.prompt.length > 80 ? `${check.prompt.slice(0, 80)}…` : check.prompt;
              const date = new Date(check.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                    {engineName}
                  </span>
                  <span className="min-w-0 flex-1 text-zinc-700">{truncatedPrompt}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      mentioned
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {mentioned ? "Mentioned" : "Not mentioned"}
                  </span>
                  <time className="shrink-0 text-xs text-zinc-400">{date}</time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-zinc-500">
            No checks run yet. Checks run automatically each month for paid plans.
          </p>
        )}
      </div>

      {/* Run check button */}
      {canRunCheck ? (
        <div className="mt-5">
          {checkDone ? (
            <p className="text-sm font-semibold text-green-700">
              Check complete — refresh to see results
            </p>
          ) : (
            <button
              type="button"
              onClick={handleRunCheck}
              disabled={isPending}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? "Running…" : "Run Check Now"}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
