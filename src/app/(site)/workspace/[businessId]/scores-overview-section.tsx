"use client";

import { useState } from "react";

type ScoreCardProps = {
  label: string;
  subtitle: string;
  score: number | null;
  grade: string | null;
  scoreDelta?: number | null;
  tooltip: string;
};

function scoreColor(score: number | null): { bg: string; text: string; badge: string } {
  if (score === null) return { bg: "bg-zinc-50", text: "text-zinc-400", badge: "bg-zinc-100 text-zinc-500" };
  if (score >= 70) return { bg: "bg-green-50", text: "text-green-800", badge: "bg-green-100 text-green-800" };
  if (score >= 45) return { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-800" };
  return { bg: "bg-red-50", text: "text-red-800", badge: "bg-red-100 text-red-800" };
}

function ScoreCard({ label, subtitle, score, grade, scoreDelta, tooltip }: ScoreCardProps) {
  const [open, setOpen] = useState(false);
  const colors = scoreColor(score);

  return (
    <div className={`rounded-2xl border border-zinc-200 ${colors.bg} p-5 shadow-sm flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="text-[11px] text-zinc-400 mt-0.5">{subtitle}</p>
        </div>
        {grade !== null ? (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${colors.badge}`}>
            {grade}
          </span>
        ) : null}
      </div>
      <p className={`text-5xl font-semibold ${colors.text}`}>
        {score !== null ? score : "—"}
      </p>
      {scoreDelta !== null && scoreDelta !== undefined ? (
        <p className={`text-sm font-semibold ${scoreDelta >= 0 ? "text-zinc-700" : "text-red-600"}`}>
          {scoreDelta >= 0 ? "+" : ""}{scoreDelta} vs last scan
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-auto text-left text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
      >
        {open ? "Hide explanation" : "What is this?"}
      </button>
      {open ? (
        <p className="text-xs text-zinc-500 leading-relaxed border-t border-zinc-200 pt-2 mt-1">
          {tooltip}
        </p>
      ) : null}
    </div>
  );
}

type Props = {
  seoScore: number | null;
  geoScore: number | null;
  geoGrade: string | null;
  aeoScore: number | null;
  aeoGrade: string | null;
  entityScore: number | null;
  entityGrade: string | null;
  scoreDelta: number | null;
};

export function ScoresOverviewSection({
  seoScore,
  geoScore,
  geoGrade,
  aeoScore,
  aeoGrade,
  entityScore,
  entityGrade,
  scoreDelta,
  hasContentPublishing = false,
}: Props & { hasContentPublishing?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          label="SEO Score"
          subtitle="Google visibility"
          score={seoScore}
          grade={null}
          scoreDelta={scoreDelta}
          tooltip="Your Google visibility score across profile completeness, reviews, citations, and local ranking signals."
        />
        <ScoreCard
          label="AEO Score"
          subtitle="Answer Engine Optimization"
          score={aeoScore}
          grade={aeoGrade}
          tooltip="How well your website is structured for Google featured snippets, voice search, and AI-generated answers. Schema markup, meta descriptions, and published content all contribute."
        />
        <ScoreCard
          label="GEO Score"
          subtitle="Generative Engine Optimization"
          score={geoScore}
          grade={geoGrade}
          tooltip="How often AI assistants like ChatGPT and Perplexity mention your business when people ask relevant questions. Tracked via live AI probes."
        />
        <ScoreCard
          label="Entity Score"
          subtitle="Business consistency"
          score={entityScore}
          grade={entityGrade}
          tooltip="How accurately and consistently your business name, address, phone, and web presence appear across the internet. Inconsistencies confuse AI and search engines."
        />
      </div>

      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
        <p className="text-sm font-semibold text-red-900 mb-3">How GravyBlock is helping your scores</p>
        <ul className="space-y-1.5 text-sm text-zinc-700">
          {hasContentPublishing ? (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-red-500">&#x2713;</span>
              Publishing weekly articles to improve your AEO signals
            </li>
          ) : (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-zinc-300">&#x2713;</span>
              <span className="text-zinc-400">Weekly article publishing <a href="/pricing" className="text-red-600 underline">— upgrade to Scale</a></span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">&#x2713;</span>
            Running monthly AI citation probes to track your GEO score
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">&#x2713;</span>
            Monitoring citation accuracy to protect your Entity score
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">&#x2713;</span>
            Generating schema markup to boost your AEO readiness
          </li>
        </ul>
      </div>
    </div>
  );
}
