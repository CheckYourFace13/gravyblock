"use client";

import { useState } from "react";

type ScoreCardProps = {
  label: string;
  subtitle: string;
  score: number | null;
  grade: string | null;
  scoreDelta?: number | null;
  improvementTips: ImprovementTip[];
  automatedActions: string[];
  tooltip: string;
};

type ImprovementTip = {
  text: string;
  automated: boolean; // true = GravyBlock does this, false = you need to do this
  priority: "high" | "medium" | "low";
};

function gradeColor(grade: string | null, score: number | null) {
  const s = score ?? 0;
  if (s >= 70) return { bg: "bg-green-50", text: "text-green-800", badge: "bg-green-100 text-green-800", border: "border-green-200" };
  if (s >= 45) return { bg: "bg-yellow-50", text: "text-yellow-800", badge: "bg-yellow-100 text-yellow-800", border: "border-yellow-200" };
  return { bg: "bg-red-50", text: "text-red-800", badge: "bg-red-100 text-red-800", border: "border-red-200" };
}

function ScoreCard({ label, subtitle, score, grade, scoreDelta, improvementTips, automatedActions, tooltip }: ScoreCardProps) {
  const [open, setOpen] = useState(false);
  const colors = score !== null ? gradeColor(grade, score) : { bg: "bg-zinc-50", text: "text-zinc-400", badge: "bg-zinc-100 text-zinc-500", border: "border-zinc-200" };
  const needsWork = score !== null && score < 60;
  const critical = score !== null && score < 30;

  return (
    <div className={`rounded-2xl border ${colors.border} ${colors.bg} p-5 shadow-sm flex flex-col gap-2`}>
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

      {/* Quick status line for critical scores */}
      {critical && score !== null && (
        <p className="text-xs font-medium text-red-700">
          ⚠ Needs attention — {score === 0 ? "no data yet" : "below threshold"}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-auto text-left text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline"
      >
        {open ? "Hide" : needsWork ? "How to improve ↓" : "What is this?"}
      </button>

      {open ? (
        <div className="border-t border-zinc-200 pt-3 mt-1 space-y-3">
          <p className="text-xs text-zinc-500 leading-relaxed">{tooltip}</p>

          {improvementTips.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                {needsWork ? "How to improve" : "What helps this score"}
              </p>
              <ul className="space-y-1.5">
                {improvementTips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 text-[10px] font-bold rounded px-1 py-0.5 ${
                      tip.automated
                        ? "bg-red-100 text-red-700"
                        : tip.priority === "high"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-zinc-100 text-zinc-500"
                    }`}>
                      {tip.automated ? "AUTO" : tip.priority === "high" ? "DO" : "TIP"}
                    </span>
                    <span className="text-xs text-zinc-700 leading-relaxed">{tip.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-zinc-400">
                <span className="font-semibold text-red-600">AUTO</span> = GravyBlock handles this automatically ·{" "}
                <span className="font-semibold text-amber-600">DO</span> = action needed from you
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Score-specific improvement tips ──────────────────────────────────────────

function getSeoTips(score: number | null): ImprovementTip[] {
  if (score === null) return [];
  const tips: ImprovementTip[] = [];
  if (score < 80) tips.push({ text: "GravyBlock publishes weekly SEO articles with local keywords — each one signals to Google that your business is active", automated: true, priority: "high" });
  if (score < 70) tips.push({ text: "Get to 20+ Google reviews — review velocity is one of the top 3 local ranking factors", automated: false, priority: "high" });
  if (score < 65) tips.push({ text: "Claim listings on Yelp, Bing Places, Apple Maps, and BBB — citation signals directly lift your SEO score", automated: false, priority: "high" });
  if (score < 60) tips.push({ text: "GravyBlock generates directory profile copy and claim links for you — check your Action Items below", automated: true, priority: "medium" });
  if (score < 55) tips.push({ text: "Connect Google Search Console to see which keywords you rank for and track improvement over time", automated: false, priority: "medium" });
  if (score < 50) tips.push({ text: "Fix technical SEO issues flagged in your Tech Audit section below (missing schema, slow load, etc.)", automated: false, priority: "high" });
  return tips.slice(0, 5);
}

function getAeoTips(score: number | null): ImprovementTip[] {
  if (score === null) return [];
  const tips: ImprovementTip[] = [];
  if (score < 90) tips.push({ text: "GravyBlock writes every article with a direct-answer first paragraph — AI assistants quote this format directly", automated: true, priority: "high" });
  if (score < 80) tips.push({ text: "GravyBlock auto-injects LocalBusiness + Article schema markup into every article published to your website", automated: true, priority: "high" });
  if (score < 70) tips.push({ text: "Add a meta description to your homepage — AI search tools pull this as your citation text", automated: false, priority: "high" });
  if (score < 60) tips.push({ text: "Add H1 headings phrased as questions (e.g. 'How does X work?') — directly increases AI citation rate", automated: false, priority: "medium" });
  if (score < 50) tips.push({ text: "Publish 4+ articles — AI assistants won't cite businesses with thin content footprints", automated: false, priority: "high" });
  return tips.slice(0, 4);
}

function getGeoTips(score: number | null): ImprovementTip[] {
  if (score === null) return [];
  const tips: ImprovementTip[] = [];
  tips.push({ text: "GravyBlock runs monthly AI probes across ChatGPT, Perplexity, and Copilot — your score updates automatically each month", automated: true, priority: "high" });
  if (score < 20) tips.push({ text: "Verify your Market Scope is set correctly in Business Profile — wrong scope = wrong AI probe questions = false zero", automated: false, priority: "high" });
  if (score < 30) tips.push({ text: "GravyBlock publishes articles in AI-citation format (direct answer first, Q&A headings) — typically needs 4+ articles before AI starts mentioning you", automated: true, priority: "high" });
  if (score < 40) tips.push({ text: "Get listed on 10+ directories — AI assistants cross-reference multiple sources to verify a business exists", automated: false, priority: "medium" });
  if (score < 50) tips.push({ text: "First GEO improvements typically visible after 60–90 days of consistent content. AI model knowledge updates on a lag.", automated: false, priority: "low" });
  if (score === 0) tips.push({ text: "If probes show 0/0 (no probes run yet), monthly probes will start next cycle. First results take 30–60 days.", automated: false, priority: "medium" });
  return tips.slice(0, 5);
}

function getEntityTips(score: number | null): ImprovementTip[] {
  if (score === null) return [];
  const tips: ImprovementTip[] = [];
  if (score < 80) tips.push({ text: "GravyBlock runs monthly citation audits to flag NAP inconsistencies across Yelp, BBB, Apple Maps, and more", automated: true, priority: "high" });
  if (score < 60) tips.push({ text: "Claim your Yelp, Apple Maps, Bing Places, and Facebook Business pages — each one adds 8–15 points to entity score", automated: false, priority: "high" });
  if (score < 50) tips.push({ text: "Make sure your Name, Address, and Phone are identical everywhere — even formatting differences (St vs Street) hurt this score", automated: false, priority: "high" });
  if (score < 40) tips.push({ text: "Add Instagram or Facebook profile to your Business Profile below — social presence adds significant entity signals", automated: false, priority: "medium" });
  if (score < 30) tips.push({ text: "GravyBlock generates pre-written directory profile copy you can paste — check Action Items for your claim links", automated: true, priority: "medium" });
  return tips.slice(0, 4);
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  seoScore: number | null;
  geoScore: number | null;
  geoGrade: string | null;
  aeoScore: number | null;
  aeoGrade: string | null;
  entityScore: number | null;
  entityGrade: string | null;
  scoreDelta: number | null;
  hasContentPublishing?: boolean;
  publishedCount?: number;
  probesRun?: number;
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
  publishedCount = 0,
  probesRun = 0,
}: Props) {
  // Derive the single biggest thing to do right now
  const criticalScore = [
    { label: "GEO", score: geoScore ?? 0 },
    { label: "Entity", score: entityScore ?? 0 },
    { label: "SEO", score: seoScore ?? 0 },
    { label: "AEO", score: aeoScore ?? 0 },
  ].sort((a, b) => a.score - b.score)[0];

  const topAction = (() => {
    if ((geoScore ?? 0) === 0 && probesRun === 0) return "Set your Market Scope in Business Profile — wrong scope means AI probes ask the wrong questions and always return 0";
    if ((geoScore ?? 0) === 0) return "GEO is 0 — AI hasn't mentioned you yet. GravyBlock is publishing citation-worthy content. First mentions typically appear after 60–90 days.";
    if ((entityScore ?? 100) < 30) return "Entity score is low — claim your Yelp, BBB, and Apple Maps listings to fix it fast";
    if ((seoScore ?? 100) < 50) return "SEO score needs work — focus on reviews and directory citations this month";
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ScoreCard
          label="SEO Score"
          subtitle="Google visibility"
          score={seoScore}
          grade={null}
          scoreDelta={scoreDelta}
          tooltip="Your Google Maps and organic visibility score. Factors: review count, GBP completeness, citations, content, and technical signals."
          improvementTips={getSeoTips(seoScore)}
          automatedActions={["Weekly articles", "Citation monitoring"]}
        />
        <ScoreCard
          label="AEO Score"
          subtitle="Answer Engine Optimization"
          score={aeoScore}
          grade={aeoGrade}
          tooltip="How well your content is structured for AI answer engines (Google AI Overviews, ChatGPT, Perplexity). Schema markup, direct-answer paragraphs, and published articles all contribute."
          improvementTips={getAeoTips(aeoScore)}
          automatedActions={["Schema injection", "Direct-answer articles"]}
        />
        <ScoreCard
          label="GEO Score"
          subtitle="Generative Engine Optimization"
          score={geoScore}
          grade={geoGrade}
          tooltip="How often ChatGPT, Perplexity, and Copilot mention your business when users ask relevant questions. Tracked via live AI probes that run monthly. Score = 60% mention rate + 40% confidence."
          improvementTips={getGeoTips(geoScore)}
          automatedActions={["Monthly AI probes", "Citation-format articles"]}
        />
        <ScoreCard
          label="Entity Score"
          subtitle="Business consistency"
          score={entityScore}
          grade={entityGrade}
          tooltip="How accurately your Name, Address, and Phone appear across the web. Inconsistencies in directories and social profiles confuse AI and search engines — hurting both GEO and SEO."
          improvementTips={getEntityTips(entityScore)}
          automatedActions={["Monthly citation audit", "NAP monitoring"]}
        />
      </div>

      {/* Top priority call-out */}
      {topAction && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 text-base shrink-0 mt-0.5">⚡</span>
          <div>
            <p className="text-xs font-semibold text-amber-900 mb-0.5">Highest priority right now</p>
            <p className="text-sm text-amber-800">{topAction}</p>
          </div>
        </div>
      )}

      {/* What GravyBlock is doing — score-aware */}
      <div className="rounded-2xl border border-red-100 bg-red-50/60 p-5">
        <p className="text-sm font-semibold text-red-900 mb-3">What GravyBlock is doing for you</p>
        <ul className="space-y-1.5 text-sm text-zinc-700">
          <li className="flex items-start gap-2">
            <span className={`mt-0.5 shrink-0 ${hasContentPublishing ? "text-red-500" : "text-zinc-300"}`}>✓</span>
            {hasContentPublishing
              ? `Publishing AI-citation articles (${publishedCount} published so far — AI typically starts citing after 4+)`
              : <span>Weekly article publishing — <a href="/pricing" className="text-red-600 underline">upgrade to Scale</a> to unlock</span>}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">✓</span>
            {probesRun > 0
              ? `Running monthly AI probes — ${probesRun} probes completed across ChatGPT, Perplexity, and Copilot`
              : "Monthly AI probes scheduled — first run next cycle"}
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">✓</span>
            Injecting LocalBusiness + Article schema markup into every published article
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">✓</span>
            Running monthly citation audit to protect Entity score
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-500">✓</span>
            Submitting your pages to search engines (IndexNow + Google) so you get found faster
          </li>
          {(entityScore ?? 100) < 40 && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">○</span>
              <span className="text-amber-800 font-medium">Entity score needs your attention — check Action Items for directory claim links</span>
            </li>
          )}
          {(geoScore ?? 100) === 0 && probesRun > 0 && (
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-amber-500">○</span>
              <span className="text-amber-800 font-medium">GEO is 0 — verify your Market Scope matches your business type so probes ask the right questions</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
