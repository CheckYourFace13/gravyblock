import type { BandRow, Compare, DataStatus, LowCtr, Move, Seasonal } from "./analysis";
import type { FeatureGap, PageFeatures } from "./competitors";
import type { LaunchPlan, SearchStage } from "./research";
import type { Cluster, DemandStrength, ImprMove, QP, SeasonalQuery, SectionStat, Split } from "./deep";
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
  kind: "indexing" | "low_ctr" | "near_page_one" | "page_two" | "declining" | "competitor_gap" | "confirmed_problem" | "systemic_ctr" | "topic_ranking" | "cannibalization" | "new_demand" | "conversion" | "mobile_ctr" | "seasonal" | "template_loss";
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
  /** v3 decision support (absent on older records) */
  horizon?: "quick win" | "medium term" | "long term";
  confidence?: "high" | "medium" | "low";
  /** how this brings MORE relevant visitors, sign-ups or customers (not an SEO score) */
  why?: string;
  /** what is uncertain about it */
  uncertainty?: string;
  /** how success will be judged afterwards */
  measure?: string;
  /** the searches this targets; used to recognise work already live on the site */
  targetQueries?: string[];
  scope?: "page" | "template" | "site";
  demand?: DemandStrength;
  /** for missing-demand items: the page already answers it (visibility work), the closest page needs expanding, or nothing serves it yet */
  demandMode?: "existing_covers" | "expand" | "new";
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
  demand: {
    source: string;
    checkedAt: string;
    seeds: string[];
    suggestions: number;
    uncaptured: Array<{
      label: string;
      queries: string[];
      competitorPages: Array<{ url: string; title: string; observedAt: string }>;
      /** v3 */
      sources?: string[];
      strength?: DemandStrength;
      intent?: string;
      existingPage?: { url: string; title: string; covers: boolean; indexable: boolean } | null;
    }>;
    notes: string[];
  };
  competitorFilter: { kept: string[]; rejected: Array<{ site: string; reason: string }> };
  learnedWeights: Record<string, number>;
  /** v3 additions (absent in reports built before them) */
  googleBrand?: { source: "Google branded classification" | "name match estimate"; branded: Split | null; nonBranded: Split | null; note: string };
  appearances?: Split[];
  surfaces?: Array<Split & { clicksPrev: number; impressionsPrev: number }>;
  queries90?: { window: { start: string; end: string }; gaining: ImprMove[]; losing: ImprMove[] } | null;
  seasonalAhead?: { window: { start: string; end: string }; queries: SeasonalQuery[]; note: string } | null;
  templateLosses?: SectionStat[];
  coverage?: { pageQueryRows: number; truncated: boolean; queryShare: number | null };
  inventory?: { pages: number; source: string };
  intents?: IntentResearch[];
  partners?: Array<{ name: string; url: string; note: string; foundAt: string }>;
  /** live state of pages that lost most of their visibility (a redirect, noindex or canonical elsewhere means the loss is deliberate) */
  lossChecks?: Array<{ url: string; status: number | null; finalUrl: string; indexable: boolean; canonical: string }>;
  /** where the site stands with Google (launch, early data, established); moves on its own as data accumulates */
  stage?: { stage: SearchStage; reason: string };
  /** launch-stage plan (absent once the site is established in Search Console) */
  launch?: LaunchPlan | null;
};

export type DemandGroup = DeepIntel["demand"]["uncaptured"][number];

/** One important search intent: the page of ours that serves it, competing pages published for it, and what each side covers. */
export type IntentResearch = {
  label: string;
  queries: string[];
  source: "search console" | "autocomplete";
  position: number | null;
  impressions: number;
  ourUrl: string | null;
  competitorPages: Array<{ url: string; title: string; host: string; observedAt: string; words: number; hasTool: boolean; tables: number; hasFaqSchema: boolean }>;
  theyCover: string[];
  weDoBetter: string[];
  gaps: FeatureGap[];
  observedAt: string;
};
