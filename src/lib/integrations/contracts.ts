import type { GooglePlaceCandidate, GooglePlaceDetails } from "@/lib/integrations/google-places";
import type { SearchVisibilitySummary } from "@/lib/report/types";

export interface GooglePlacesPort {
  searchCandidates(input: { query: string; locationHint?: string }): Promise<GooglePlaceCandidate[]>;
  getDetails(placeId: string): Promise<GooglePlaceDetails>;
}

export interface GoogleBusinessProfilePort {
  fetchOwnerEnrichment(businessId: string): Promise<{ available: boolean; note: string }>;
}

export interface GoogleSearchConsolePort {
  pullMetrics(input: { propertyUrl?: string; days?: number }): Promise<SearchVisibilitySummary>;
}

export interface SiteCrawlerPort {
  crawl(website?: string): Promise<{
    score: number;
    findings: Array<{ key: string; title: string; detail: string; severity: "high" | "medium" | "low" }>;
  }>;
}
