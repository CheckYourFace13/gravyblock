import type { BandRow, Compare, DataStatus, LowCtr, Move, Seasonal } from "./analysis";
import type { FeatureGap, PageFeatures } from "./competitors";

export type CompetitorQuery = {
  query: string;
  impressions: number;
  position: number;
  ourPage: PageFeatures | null;
  competitorPages: Array<PageFeatures & { host: string }>;
  gaps: FeatureGap[];
};

export type SiteBrief = { type: string; subtype: string | null; impact: number; text: string };

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
};

export type Improvement = {
  kind: "indexing" | "low_ctr" | "near_page_one" | "page_two" | "declining" | "competitor_gap" | "confirmed_problem";
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
