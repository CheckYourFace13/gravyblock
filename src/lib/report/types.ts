export type Vertical =
  | "bar"
  | "restaurant"
  | "brewery"
  | "retail"
  | "healthcare"
  | "home_services"
  | "professional_services"
  | "online_brand"
  | "hybrid"
  | "other";

export type BusinessProfile = {
  name: string;
  vertical: Vertical;
  placeId?: string;
  address?: string;
  website?: string;
  phone?: string;
  rating?: string;
  reviewCount?: string;
  googleMapsUri?: string;
  primaryCategory?: string;
  types?: string[];
  latitude?: number;
  longitude?: number;
  businessStatus?: string;
  openNow?: boolean;
};

export type ReportIssue = {
  id: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
};

export type ReportFix = {
  id: string;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
};

export type ReportSection = {
  key: string;
  title: string;
  score: number;
  summary: string;
  issues: ReportIssue[];
  fixes: ReportFix[];
};

export type ReportSummary = {
  title: string;
  score: number;
  verdict: string;
};

export type ReportPayload = {
  brand: "GravyBlock";
  generatedAt: string;
  summary: ReportSummary;
  business: {
    placeId?: string;
    name: string;
    address?: string;
    website?: string;
    phone?: string;
    rating?: string;
    reviewCount?: number;
    googleMapsUri?: string;
    primaryCategory?: string;
    types?: string[];
    latitude?: number;
    longitude?: number;
    businessStatus?: string;
    openNow?: boolean;
  };
  sourceAttribution: DataSourceAttribution[];
  googlePresence: GooglePresenceSnapshot;
  websiteConversionHealth: WebsiteAuditSummary;
  searchVisibility: SearchVisibilitySummary;
  localRankingSignals: LocalRankingSummary;
  sections: ReportSection[];
  prioritizedFixes: ReportFix[];
  opportunityLevel: "high" | "medium" | "low";
};

export type DataSourceId =
  | "google_places"
  | "google_business_profile"
  | "google_search_console"
  | "site_crawl"
  | "estimated_local_rank";

export type DataSourceAttribution = {
  source: DataSourceId;
  mode: "verified" | "estimated";
  used: boolean;
  note: string;
};

export type GooglePresenceSnapshot = {
  confidence: number;
  placeId?: string;
  displayName?: string;
  address?: string;
  category?: string;
  mapsUri?: string;
  rating?: number;
  reviewCount?: number;
  businessStatus?: string;
  openNow?: boolean;
  coordinates?: { lat: number; lng: number };
};

export type WebsiteAuditFinding = {
  key: string;
  title: string;
  detail: string;
  severity: "high" | "medium" | "low";
  source: "site_crawl";
  estimated: boolean;
};

export type WebsiteAuditSummary = {
  score: number;
  findings: WebsiteAuditFinding[];
  signals: {
    finalUrl?: string;
    statusCode?: number;
    hasTitle: boolean;
    hasMetaDescription: boolean;
    hasH1: boolean;
    hasViewport: boolean;
    hasStructuredData: boolean;
    hasClickToCall: boolean;
    locationClarity: boolean;
    hoursClarity: boolean;
    ctaClarity: boolean;
    speedHook: "not_tested";
  };
};

export type SearchConsoleMetricRow = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type SearchVisibilitySummary = {
  verified: boolean;
  propertyUrl?: string;
  topQueries: SearchConsoleMetricRow[];
  topPages: Array<{
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  aggregate?: {
    clicks: number;
    impressions: number;
    ctr: number;
    averagePosition: number;
  };
  note: string;
};

export type LocalRankingCheck = {
  query: string;
  estimatedPosition: number | null;
  inTop3: boolean;
  inMapPack: boolean;
  confidence: number;
  source: "estimated_local_rank";
  competitors: Array<{
    placeId: string;
    name: string;
    rating?: number;
    reviewCount?: number;
    position: number;
  }>;
};

export type LocalRankingSummary = {
  checks: LocalRankingCheck[];
  note: string;
};

export type WebsiteSignals = {
  fetched: boolean;
  finalUrl?: string;
  https: boolean;
  status?: number;
  title?: string;
  h1?: string;
  metaDescription?: string;
  hasNoindexMeta?: boolean;
  hasViewportMeta: boolean;
  hasTelLinks: boolean;
  hasMapEmbed: boolean;
  hasStructuredData: boolean;
  hasNearMeLanguage: boolean;
  hasClearCtaWords: boolean;
  hasHoursLanguage: boolean;
  hasLocationLanguage: boolean;
  htmlLength: number;
  error?: string;
};
