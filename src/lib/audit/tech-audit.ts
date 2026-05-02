/**
 * ─── Feature #10: Site Tech Audit ────────────────────────────────────────────
 * Lightweight technical SEO check using existing crawl data from the database.
 * Zero additional API cost — reads audit_findings table and the latest snapshot.
 *
 * Checks: meta tags, HTTPS, viewport, H1, structured data, click-to-call,
 * location clarity, hours clarity, CTA clarity, internal links.
 */

import { desc, eq } from "drizzle-orm";
import { getDb, businesses, auditFindings, visibilitySnapshots } from "@/lib/db";

export type TechAuditItem = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type TechAuditResult = {
  score: number;       // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  items: TechAuditItem[];
  website: string | null;
  checkedAt: string;
};

function gradeFromScore(score: number): TechAuditResult["grade"] {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

export async function getSiteTechAudit(businessId: string): Promise<TechAuditResult | null> {
  const db = getDb();
  if (!db) return null;

  const [biz] = await db
    .select({ website: businesses.website })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!biz) return null;

  // Pull the most recent audit findings for this business
  const findings = await db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.businessId, businessId))
    .orderBy(desc(auditFindings.createdAt))
    .limit(50);

  // Pull latest snapshot for sectionScores
  const [snapshot] = await db
    .select({ sectionScores: visibilitySnapshots.sectionScores })
    .from(visibilitySnapshots)
    .where(eq(visibilitySnapshots.businessId, businessId))
    .orderBy(desc(visibilitySnapshots.createdAt))
    .limit(1);

  // Match findings by title/category keywords (auditFindings has no key column)
  function titleIncludes(...terms: string[]) {
    return findings.find((f) =>
      terms.some((t) => f.title.toLowerCase().includes(t) || f.category.toLowerCase().includes(t)),
    );
  }

  function check(
    key: string,
    label: string,
    matchTerms: string[],
    passDetail: string,
    failDetail: string,
  ): TechAuditItem {
    const found = titleIncludes(...matchTerms);
    if (found) {
      return {
        key,
        label,
        status: found.severity === "high" ? "fail" : "warn",
        detail: found.detail ?? failDetail,
      };
    }
    return { key, label, status: "pass", detail: passDetail };
  }

  const items: TechAuditItem[] = [
    check("no-https", "HTTPS / secure connection", ["https", "secure", "ssl"], "Site is served over HTTPS.", "Site is not using HTTPS — Google penalizes non-secure sites."),
    check("no-viewport", "Mobile viewport meta tag", ["viewport", "mobile"], "Viewport meta tag present — site is mobile-friendly.", "Missing viewport meta tag. Mobile users will see a zoomed-out desktop layout."),
    check("no-title", "Page title tag", ["title tag", "no title", "missing title"], "Title tag present.", "Missing title tag — critical for search rankings."),
    check("no-meta-description", "Meta description", ["meta description", "description tag"], "Meta description present.", "Missing meta description — lost click-through opportunity in search results."),
    check("no-h1", "H1 heading", ["h1", "heading"], "H1 heading found on homepage.", "No H1 found — search engines use this to understand your page topic."),
    check("no-structured-data", "Structured data (schema.org)", ["structured data", "schema", "json-ld"], "Structured data found — helps AI and search understand your business.", "No structured data detected. Adding LocalBusiness schema improves AI visibility."),
    check("no-cta", "Call-to-action clarity", ["call to action", "cta", "contact"], "Homepage has clear calls to action.", "No clear CTA detected — visitors may not know what to do next."),
    check("no-location", "Location/service-area clarity", ["location", "service area", "city"], "Location language found — search engines can confirm your service area.", "No location language on homepage. Mention your city and service area explicitly."),
    check("no-hours", "Business hours visible", ["hours", "open", "schedule"], "Hours language detected on homepage.", "Hours not visible on homepage. This reduces trust and local relevance signals."),
    check("no-tel", "Click-to-call phone link", ["phone", "tel:", "click to call", "telephone"], "Clickable phone number found.", "No tel: link found. Mobile users can't tap to call directly."),
  ];

  // Add website missing check
  if (!biz.website) {
    items.unshift({
      key: "no-website",
      label: "Website connected",
      status: "fail",
      detail: "No website URL on your Google listing. Add one to unlock all tech audit checks.",
    });
  }

  // Synthetic checks from sectionScores if available
  if (snapshot?.sectionScores && typeof snapshot.sectionScores === "object") {
    const scores = snapshot.sectionScores as Record<string, number>;
    if (scores.technical !== undefined && scores.technical < 50) {
      items.push({
        key: "low-technical-score",
        label: "Technical SEO score",
        status: "warn",
        detail: `Technical score is ${scores.technical}/100 — run another scan after making fixes to update this.`,
      });
    }
  }

  const passes = items.filter((i) => i.status === "pass").length;
  const score = Math.round((passes / items.length) * 100);

  return {
    score,
    grade: gradeFromScore(score),
    items,
    website: biz.website ?? null,
    checkedAt: findings[0]?.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
