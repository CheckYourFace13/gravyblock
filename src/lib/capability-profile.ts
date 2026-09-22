/**
 * Universal Customer Capability Profile. One generic read that tells every engine what it is
 * allowed to do automatically for THIS business — composed entirely from existing generic
 * signals (Business Truth, operating mode, site connector capabilities, connection readiness).
 * No business is special-cased: a brand-new customer gets a profile from the same signals a
 * house account does, the moment enough first-party data exists.
 */

import { getOperatingMode, type BusinessMode } from "@/lib/business-mode";
import { getBusinessTruth } from "@/lib/truth";
import { getSiteTarget, type SiteCapabilities } from "@/lib/site-publish/adapters";
import { getConnectionReadiness } from "@/lib/onboarding/connection-readiness";

export type CapabilityProfile = {
  businessId: string;
  operatingMode: BusinessMode;
  website: {
    hasWebsite: boolean;
    connected: boolean;
    adapter: string | null;
    capabilities: SiteCapabilities | null;
  };
  search: {
    gscConnected: boolean;
    sitemapKnown: boolean;
  };
  gbp: {
    connected: boolean;
    placeMatched: boolean;
  };
  social: {
    facebook: boolean;
    instagram: boolean;
  };
  reputation: {
    googleReviewsReadable: boolean;
    transactionSourceConnected: boolean;
  };
  authority: {
    category: string | null;
    place: string | null;
  };
  truthSufficient: boolean;
  /** Capabilities present right now, as a set other modules can gate on ("website_write", "gsc", "gbp", "social", "reviews", "authority"). */
  active: Set<string>;
};

export async function getCapabilityProfile(businessId: string): Promise<CapabilityProfile> {
  const [mode, truth, site, readiness] = await Promise.all([
    getOperatingMode(businessId),
    getBusinessTruth(businessId),
    getSiteTarget(businessId),
    getConnectionReadiness(businessId).catch(() => null),
  ]);

  const active = new Set<string>();
  if (site) active.add("website_write");
  if (readiness?.google.hasSearchConsoleScope) active.add("gsc");
  if (readiness?.google.connected && readiness.google.hasBusinessScope) active.add("gbp");
  if (readiness?.facebookConfigured) active.add("social");
  if (readiness?.reviewFeedConnected) active.add("reviews");
  if (truth.sufficient) active.add("truth");

  return {
    businessId,
    operatingMode: mode,
    website: {
      hasWebsite: Boolean(readiness?.publishingConnected !== undefined),
      connected: Boolean(site),
      adapter: site?.adapter ?? null,
      capabilities: site?.capabilities ?? null,
    },
    search: {
      gscConnected: Boolean(readiness?.google.hasSearchConsoleScope),
      sitemapKnown: truth.lastWebsiteCrawlAt != null,
    },
    gbp: {
      connected: Boolean(readiness?.google.connected && readiness.google.hasBusinessScope),
      placeMatched: Boolean(readiness?.google.placeMatched),
    },
    social: {
      facebook: Boolean(readiness?.facebookConfigured),
      instagram: Boolean(readiness?.instagramConfigured),
    },
    reputation: {
      googleReviewsReadable: Boolean(readiness?.google.connected),
      transactionSourceConnected: Boolean(readiness?.reviewFeedConnected),
    },
    authority: {
      category: mode.category,
      place: mode.placeLabel,
    },
    truthSufficient: truth.sufficient,
    active,
  };
}
