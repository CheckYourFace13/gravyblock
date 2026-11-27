import type { BandRow, Compare, DataStatus, LowCtr, Move, Seasonal } from "./analysis";
import type { FeatureGap, PageFeatures } from "./competitors";
import type { Cluster, QP, SectionStat, Split } from "./deep";
import type { Totals, QueryRow } from "./analysis";

export type CompetitorQuery = {
  query: string;
  impressions: number;
  position: number;
  ourPage: PageFeatures | null;
  competitorPages: Array<PageFeatures & { host: string }>;
  gaps: FeatureGap[];
};

export type SiteBrief = { type: string; subtype: string | null; impact: number; text: string; urls?: string[] };

export type SiteIntel = {
  version: 1;
  site: { businessId: string; name: string; website: string | null };
  generatedAt: string;
  weekEnding: string;
  endDay: string;
  googleConnected: boolean;
  status: DataStatus;
  w7: Compare | null;
  w28: Compare | null;
  queries7: { rising: Move[]; declining: Move[] } | null;
  queries28: { rising: Move[]; declining: Move[] } | null;
  pages7: { rising: Move[]; declining: Move[] } | null;
  pages28: { rising: Move[]; declining: Move[] } | null;
  bands: { b4_10: BandRow[]; b11_20: BandRow[]; b21_40: BandRow[] } | null;
  lowCtr: LowCtr[];
  topPages: Array<{ page: string; clicks: number; impressions: number }>;
  indexing: {
    dropped: { lost: number; before: number; impressionsBefore: number; impressionsNow: number; reading: string | null; sample: string[] } | null;
    rechecks: Array<{ at: string; verdicts: Record<string, number> }>;
    notes: string[];
  };
  seasonal: Seasonal | null;
  competitors: {
    observedAt: string;
    known: Array<{ name: string; website: string }>;
    sitemapsRead: number;
    pagesObserved: number;
    baselineEstablishedToday: string[];
    newPages: Array<{ host: string; url: string; firstSeen: string }>;
    queries: CompetitorQuery[];
    notes: string[];
  };
  openBriefs: SiteBrief[];
  authority: { qualified: number; contacted: number; verifiedLinks: number; note: string };
  changes: string[];
  dataQualityNotes: string[];
  /** v2 deeper analysis (absent in reports built before it existed) */
  deep?: DeepIntel;
};

export type Improvement = {
  /** persistent identity inputs: the issue type and the stable subset of affected URLs (see recommendation-model.fingerprintOf) */
  issue: string;
  identityUrls: string[];
  /** short reference such as SR-1A2B3C, filled in from the stored recommendation so a developer can report back against it */
  ref?: string;
  kind: "indexing" | "low_ctr" | "near_page_one" | "page_two" | "declining" | "competitor_gap" | "confirmed_problem" | "systemic_ctr" | "topic_ranking" | "cannibalization" | "new_demand" | "conversion" | "mobile_ctr";
  /** what kind of growth this is, in the owner's terms */
  category?: "technical recovery" | "CTR optimization" | "ranking improvement" | "new search demand" | "conversion";
  title: string;
  urls: string[];
  evidence: string[];
  competitorUrls: string[];
  actions: string[];
  acceptance: string[];
  /** Upper-bound estimate of extra Google clicks per 28 days if fully fixed; never a forecast. */
  potentialClicks28: number;
  priority: number;
};

export type DeepIntel = {
  profile: { what: string; audience: string; conversions: string[] } | null;
  truthDescription: string | null;
  window28: { start: string; end: string };
  trend90: { cur: Totals; prev: Totals } | null;
  devices: Split[];
  countries: Split[];
  searchTypes: { image: Split | null; video: Split | null };
  brand: { brandedClicks: number; brandedImpressions: number; nonBrandedClicks: number; nonBrandedImpressions: number };
  clusters: Cluster[];
  emerging: QueryRow[];
  cannibal: Array<{ query: string; impressions: number; pages: Array<{ page: string; impressions: number; position: number }> }>;
  sections: SectionStat[];
  pageQuery: QP[];
  demand: { source: string; checkedAt: string; seeds: string[]; suggestions: number; uncaptured: Array<{ label: string; queries: string[]; competitorPages: Array<{ url: string; title: string; observedAt: string }> }>; notes: string[] };
  competitorFilter: { kept: string[]; rejected: Array<{ site: string; reason: string }> };
  learnedWeights: Record<string, number>;
};
