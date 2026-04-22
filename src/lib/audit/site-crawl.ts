import type { WebsiteAuditFinding, WebsiteAuditSummary } from "@/lib/report/types";
import { fetchWebsiteSignals } from "@/lib/report/website";

function severityScore(s: WebsiteAuditFinding["severity"]) {
  return s === "high" ? 18 : s === "medium" ? 10 : 5;
}

export async function runSiteCrawlAudit(website?: string): Promise<WebsiteAuditSummary> {
  const signals = await fetchWebsiteSignals(website);
  const findings: WebsiteAuditFinding[] = [];

  if (!signals.fetched) {
    findings.push({
      key: "crawl-no-website",
      title: "No crawlable website found",
      detail: "Google profile has no valid website URL. Guests lose trust when discovery ends without a destination.",
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
  } else if (signals.error) {
    findings.push({
      key: "crawl-error",
      title: "Homepage could not be fetched",
      detail: `Crawler error: ${signals.error}`,
      severity: "high",
      source: "site_crawl",
      estimated: false,
    });
  } else {
    if (!signals.title) {
      findings.push({
        key: "title-missing",
        title: "Missing page title",
        detail: "Search snippets perform better when title tags clearly state venue + location intent.",
        severity: "high",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.metaDescription) {
      findings.push({
        key: "meta-description",
        title: "Missing meta description",
        detail: "Google often uses this snippet in organic results. Write one with menu + location + CTA.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.h1) {
      findings.push({
        key: "h1-missing",
        title: "Missing H1 heading",
        detail: "H1 clarity helps both crawlers and humans understand what you are and where you are.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasViewportMeta) {
      findings.push({
        key: "mobile-viewport",
        title: "Mobile viewport tag not found",
        detail: "Mobile local-intent traffic is high. Without viewport support, conversion drops quickly.",
        severity: "high",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (signals.hasNoindexMeta) {
      findings.push({
        key: "indexability-noindex",
        title: "Potential noindex directive",
        detail: "Robots meta appears to include noindex. This can suppress important pages in search.",
        severity: "high",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasStructuredData) {
      findings.push({
        key: "schema-missing",
        title: "Structured data not detected",
        detail: "Add LocalBusiness/Restaurant schema for stronger context in Google and AI answers.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasTelLinks) {
      findings.push({
        key: "tel-link-missing",
        title: "Click-to-call link missing",
        detail: "Tap-to-call should be obvious on mobile for reservations and quick booking.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasLocationLanguage) {
      findings.push({
        key: "location-clarity",
        title: "Location clarity is weak",
        detail: "Add neighborhood and landmark language so guests and AI assistants can disambiguate your venue.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasHoursLanguage) {
      findings.push({
        key: "hours-clarity",
        title: "Hours clarity is weak",
        detail: "Prominent hours reduce drop-off from “open now” and “near me” searches.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
    if (!signals.hasClearCtaWords) {
      findings.push({
        key: "cta-clarity",
        title: "Primary CTA not obvious",
        detail: "Make menu, booking, call, and directions visible above the fold.",
        severity: "medium",
        source: "site_crawl",
        estimated: false,
      });
    }
  }

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
