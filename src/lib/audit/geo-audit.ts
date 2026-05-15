/**
 * ─── Feature #8: GEO Audit Score ─────────────────────────────────────────────
 * Packages existing LLM probe data into a structured Generative Engine
 * Optimization (GEO) audit score — how visible is the business to AI assistants?
 *
 * Zero additional API cost — uses data already in the database.
 */

import { desc, eq } from "drizzle-orm";
import { getDb, aiVisibilityChecks } from "@/lib/db";

export type GeoEngineScore = {
  engine: string;
  probes: number;
  mentions: number;
  mentionRate: number;   // 0–100
  avgConfidence: number; // 0–100
  sentiment: "positive" | "neutral" | "negative" | "unknown";
};

export type GeoAuditResult = {
  overallScore: number;          // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  totalProbes: number;
  totalMentions: number;
  mentionRate: number;
  byEngine: GeoEngineScore[];
  recentMentions: Array<{ prompt: string; engine: string; date: string; citationUrl: string | null }>;
  topRecommendation: string;
};

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function recommendationFromScore(score: number, mentionRate: number): string {
  if (score >= 80) return "Strong AI visibility. Keep publishing consistent, citation-worthy content to maintain rankings.";
  if (score >= 60) return "Good presence. Add more structured data (schema markup) and FAQ content to improve how AI assistants summarize your business.";
  if (score >= 40) return "Moderate visibility. Focus on publishing authoritative local content and earning more backlinks to improve AI citation rates.";
  if (mentionRate === 0) return "Not yet appearing in AI search results. Start with a complete Google Business Profile and publish 4+ local articles to get indexed by AI models.";
  return "Low AI visibility. Prioritize content that directly answers common questions about your services and location.";
}

export async function getGeoAuditScore(businessId: string): Promise<GeoAuditResult | null> {
  const db = getDb();
  if (!db) return null;

  const probes = await db
    .select()
    .from(aiVisibilityChecks)
    .where(eq(aiVisibilityChecks.businessId, businessId))
    .orderBy(desc(aiVisibilityChecks.createdAt))
    .limit(100);

  if (probes.length === 0) return null;

  const totalProbes = probes.length;
  const totalMentions = probes.filter((p) => p.mentionFound === "true").length;
  const mentionRate = Math.round((totalMentions / totalProbes) * 100);

  // Group by engine
  const engineMap = new Map<string, { probes: number; mentions: number; confidenceSum: number; sentiments: string[] }>();
  for (const probe of probes) {
    const e = probe.engine;
    if (!engineMap.has(e)) engineMap.set(e, { probes: 0, mentions: 0, confidenceSum: 0, sentiments: [] });
    const entry = engineMap.get(e)!;
    entry.probes++;
    if (probe.mentionFound === "true") entry.mentions++;
    if (probe.confidence) entry.confidenceSum += probe.confidence;
    if (probe.sentiment) entry.sentiments.push(probe.sentiment);
  }

  const byEngine: GeoEngineScore[] = Array.from(engineMap.entries()).map(([engine, data]) => {
    const mRate = Math.round((data.mentions / data.probes) * 100);
    const avgConf = data.probes > 0 ? Math.round(data.confidenceSum / data.probes) : 0;

    const sentimentCounts = data.sentiments.reduce<Record<string, number>>((acc, s) => {
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
    const topSentiment = Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as string | undefined;

    return {
      engine,
      probes: data.probes,
      mentions: data.mentions,
      mentionRate: mRate,
      avgConfidence: avgConf,
      sentiment: (topSentiment as GeoEngineScore["sentiment"]) ?? "unknown",
    };
  });

  // Overall score: weighted combination of mention rate (60%) + avg confidence (40%)
  const avgConf = probes.filter((p) => p.confidence).reduce((s, p) => s + (p.confidence ?? 0), 0) /
    Math.max(1, probes.filter((p) => p.confidence).length);
  const overallScore = Math.round(mentionRate * 0.6 + avgConf * 0.4);

  const recentMentions = probes
    .filter((p) => p.mentionFound === "true")
    .slice(0, 5)
    .map((p) => ({
      prompt: p.prompt,
      engine: p.engine,
      date: p.createdAt.toISOString().slice(0, 10),
      citationUrl: p.citationUrl ?? null,
    }));

  return {
    overallScore,
    grade: gradeFromScore(overallScore),
    totalProbes,
    totalMentions,
    mentionRate,
    byEngine,
    recentMentions,
    topRecommendation: recommendationFromScore(overallScore, mentionRate),
  };
}
