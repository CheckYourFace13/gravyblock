import type { WebsiteAuditFinding, WebsiteAuditSummary } from "@/lib/report/types";
import { fetchWebsiteDocument, websiteSignalsFromDocument } from "@/lib/report/website";
import type { WebsiteSignals } from "@/lib/report/types";

function severityScore(s: WebsiteAuditFinding["severity"]) {
  return s === "high" ? 18 : s === "medium" ? 10 : 5;
}

const emptySignals: WebsiteSignals = {
  fetched: false,
  https: false,
  hasViewportMeta: false,
  hasTelLinks: false,
  hasMapEmbed: false,
  hasStructuredData: false,
  hasNearMeLanguage: false,
  hasClearCtaWords: false,
  hasHoursLanguage: false,
  hasLocationLanguage: false,
  htmlLength: 0,
};

function auditFromSignals(signals: WebsiteSignals, findings: WebsiteAuditFinding[]): WebsiteAuditSummary {
  const penalties = findings.reduce((sum, f) => sum + severityScore(f.severity), 0);
  const score = Math.max(5, Math.min(100, 95 - penalties));
  return {
    score,
    findings,
    signals: {
      finalUrl: signals.finalUrl,
      statusCode: signals.status,
      hasTitle: Boolean(signals.title),
      hasMetaDescription: Boolean(signals.metaDescription),
      hasH1: Boolean(signals.h1),
      hasViewport: signals.hasViewportMeta,
      hasStructuredData: signals.hasStructuredData,
      hasClickToCall: signals.hasTelLinks,
      locationClarity: signals.hasLocationLanguage,
      hoursClarity: signals.hasHoursLanguage,
      ctaClarity: signals.hasClearCtaWords,
      speedHook: "not_tested",
    },
  };
}

/**
 * Runs homepage audit. Returns optional `homepage` HTML for social discovery (same fetch — no second download).
 */
export async function runSiteCrawlAudit(website?: string): Promise<{
  audit: WebsiteAuditSummary;
  homepage?: { html: string; finalUrl: string };
}> {
  const findings: WebsiteAuditFinding[] = [];

  if (!website?.trim()) {
    findings.push({
      key: "crawl-no-website",
      title: "No crawlable website on the Google listing",
      detail:
        "Google did not return a website URL for this place yet. Searchers often bounce when they cannot verify hours, menus, or proof you serve their area.",
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
    return { audit: auditFromSignals(emptySignals, findings), homepage: undefined };
  }

  const doc = await fetchWebsiteDocument(website);
  if (!doc.ok) {
    findings.push({
      key: "crawl-error",
      title: "Homepage could not be fetched",
      detail: `Crawler error: ${doc.error}`,
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
    return { audit: auditFromSignals({ ...emptySignals, fetched: true, error: doc.error }, findings), homepage: undefined };
  }

  const signals = websiteSignalsFromDocument(doc);

  if (!signals.title) {
    findings.push({
      key: "title-missing",
      title: "Missing page title",
      detail: "Search snippets work best when the title states who you are, what you offer, and (when relevant) service area or city.",
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.metaDescription) {
    findings.push({
      key: "meta-description",
      title: "Missing meta description",
      detail: "Google often uses this line in results. Summarize your offer, proof, and the next step (call, book, visit).",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.h1) {
    findings.push({
      key: "h1-missing",
      title: "Missing H1 heading",
      detail: "A clear H1 helps visitors and crawlers confirm they landed on the right business.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasViewportMeta) {
    findings.push({
      key: "mobile-viewport",
      title: "Mobile viewport tag not found",
      detail: "Most local and service-area traffic is mobile. Missing viewport configuration hurts readability and conversion.",
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (signals.hasNoindexMeta) {
    findings.push({
      key: "indexability-noindex",
      title: "Potential noindex directive",
      detail: "Robots meta appears to include noindex. That can block important pages from being indexed.",
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasStructuredData) {
    findings.push({
      key: "schema-missing",
      title: "Structured data not detected",
      detail: "Add LocalBusiness (or the closest Schema.org type) so Google and assistants can ground facts about you.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasTelLinks) {
    findings.push({
      key: "tel-link-missing",
      title: "Click-to-call link missing",
      detail: "Make tap-to-call or contact frictionless on mobile — especially for high-intent “near me” visits.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasLocationLanguage) {
    findings.push({
      key: "location-clarity",
      title: "Location / service-area clarity is weak",
      detail: "Spell out where you serve (city, neighborhood, or radius) so people and maps-style queries can trust the match.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasHoursLanguage) {
    findings.push({
      key: "hours-clarity",
      title: "Hours clarity is weak",
      detail: "Prominent hours reduce drop-off from “open now” and urgent local searches.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }
  if (!signals.hasClearCtaWords) {
    findings.push({
      key: "cta-clarity",
      title: "Primary call-to-action not obvious",
      detail: "Surface the main action you want (call, book, quote, directions) above the fold on mobile.",
      severity: "medium",
      source: "site_crawl",
      estimated: false,
    });
  }

  return {
    audit: auditFromSignals(signals, findings),
    homepage: { html: doc.html, finalUrl: doc.finalUrl },
  };
}
