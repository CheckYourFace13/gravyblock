import type { ReportFix, ReportIssue, ReportPayload } from "@/lib/report/types";

export type RoadmapLane = "fix_now" | "improve_next" | "growth_opportunities" | "ongoing_monitoring";

export type RoadmapLaneMeta = {
  lane: RoadmapLane;
  title: string;
  subtitle: string;
};

export const ROADMAP_LANES: RoadmapLaneMeta[] = [
  {
    lane: "fix_now",
    title: "Fix now",
    subtitle: "Trust and revenue leaks that show up the moment someone compares you to alternatives.",
  },
  {
    lane: "improve_next",
    title: "Improve next",
    subtitle: "High-leverage upgrades once the critical path is stable — still mostly one team, one sprint.",
  },
  {
    lane: "growth_opportunities",
    title: "Growth opportunities",
    subtitle: "Content, authority, and demand plays that compound when you run them on a cadence.",
  },
  {
    lane: "ongoing_monitoring",
    title: "Ongoing monitoring",
    subtitle: "What to watch so rankings, listings, and site quality do not quietly drift backward.",
  },
];

export type RoadmapRow = {
  lane: RoadmapLane;
  category: string;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
};

function impactRank(i: "high" | "medium" | "low") {
  return i === "high" ? 3 : i === "medium" ? 2 : 1;
}

function issueToRow(issue: ReportIssue, sectionKey: string, lane: RoadmapLane): RoadmapRow {
  return {
    lane,
    category: sectionKey,
    title: issue.title,
    detail: issue.detail,
    impact: issue.severity === "high" ? "high" : issue.severity === "medium" ? "medium" : "low",
  };
}

function fixToRow(fix: ReportFix, sectionKey: string, lane: RoadmapLane): RoadmapRow {
  return {
    lane,
    category: sectionKey,
    title: fix.title,
    detail: fix.detail,
    impact: fix.impact,
  };
}

/** Consultant-style roadmap rows derived from a scan payload (also persisted as `recommendations`). */
export function buildRoadmapRows(payload: ReportPayload): RoadmapRow[] {
  const rows: RoadmapRow[] = [];
  const seenIssueIds = new Set<string>();
  const seenFixIds = new Set<string>();

  for (const section of payload.sections) {
    const issueTitles = new Set(section.issues.map((i) => i.title.trim().toLowerCase()));

    for (const issue of section.issues) {
      if (seenIssueIds.has(issue.id)) continue;
      seenIssueIds.add(issue.id);
      const lane: RoadmapLane =
        issue.severity === "high"
          ? "fix_now"
          : issue.severity === "medium"
            ? "improve_next"
            : "growth_opportunities";
      rows.push(issueToRow(issue, section.key, lane));
    }
    for (const fix of section.fixes) {
      if (seenFixIds.has(fix.id)) continue;
      if (issueTitles.has(fix.title.trim().toLowerCase())) continue;
      seenFixIds.add(fix.id);
      const lane: RoadmapLane =
        fix.impact === "high" && section.score < 70
          ? "fix_now"
          : fix.impact === "high"
            ? "improve_next"
            : section.score < 60
              ? "improve_next"
              : "growth_opportunities";
      rows.push(fixToRow(fix, section.key, lane));
    }
  }

  for (const fix of payload.prioritizedFixes.slice(0, 3)) {
    if (seenFixIds.has(fix.id)) continue;
    seenFixIds.add(fix.id);
    rows.push({
      lane: "fix_now",
      category: "priority",
      title: fix.title,
      detail: fix.detail,
      impact: fix.impact,
    });
  }

  rows.push({
    lane: "ongoing_monitoring",
    category: "maps",
    title: "Google Business Profile freshness",
    detail:
      "Photos, hours, services, and short posts signal an active business to maps and to people comparing two similar options.",
    impact: "high",
  });
  rows.push({
    lane: "ongoing_monitoring",
    category: "reviews",
    title: "Review velocity vs. nearby competitors",
    detail: "Steady recent reviews outperform old spikes when buyers are deciding between two similar ratings.",
    impact: "medium",
  });
  rows.push({
    lane: "ongoing_monitoring",
    category: "ai_visibility",
    title: "AI answer readiness (ChatGPT / Perplexity / Gemini)",
    detail:
      "Track whether assistants describe you accurately — NAP, hours, service area, and signature offers should match your site and listing.",
    impact: "medium",
  });

  const deduped: RoadmapRow[] = [];
  const seen = new Set<string>();
  for (const row of rows.sort((a, b) => impactRank(b.impact) - impactRank(a.impact))) {
    const key = `${row.lane}:${row.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.slice(0, 48);
}

export function sectionScoresFromPayload(payload: ReportPayload) {
  return Object.fromEntries(payload.sections.map((s) => [s.key, s.score]));
}
