import { autoTradePage } from "./auto-trade";
import { healthWellnessPage } from "./health-wellness";
import { homeServicesPage } from "./home-services";
import { hospitalityPage } from "./hospitality";
import { localRetailPage } from "./local-retail";
import { professionalServicesPage } from "./professional-services";
import { propertyVenuesPage } from "./property-venues";
import type { IndustryPageModel, IndustrySlug } from "./types";

export const INDUSTRY_PAGES: Record<IndustrySlug, IndustryPageModel> = {
  "home-services": homeServicesPage,
  "professional-services": professionalServicesPage,
  "health-wellness": healthWellnessPage,
  "local-retail": localRetailPage,
  "auto-trade": autoTradePage,
  "property-venues": propertyVenuesPage,
  hospitality: hospitalityPage,
};

export const INDUSTRY_SLUGS = Object.keys(INDUSTRY_PAGES) as IndustrySlug[];

export function getIndustryPage(slug: string): IndustryPageModel | null {
  if (slug in INDUSTRY_PAGES) return INDUSTRY_PAGES[slug as IndustrySlug];
  return null;
}
