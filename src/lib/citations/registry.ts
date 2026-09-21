/**
 * Citation / listing target registry.
 *
 * Each target records what can LEGITIMATELY be automated with no recurring
 * customer work. Directories that require a human/business verification step
 * (postcard, phone call, ID, captcha) or whose terms prohibit automated
 * submission are marked unsupported for no-touch automation — GravyBlock does
 * not turn them into a task queue for the customer, and does not create
 * accounts on anyone's behalf. Paid aggregators are listed for completeness
 * but are NOT enabled (no new recurring cost without approval).
 */

export type Automation =
  | "checkable_via_connection" // read/compare through an API the customer already authorized once
  | "checkable_public_api" // free public API can detect the listing and compare NAP
  | "verification_required" // owner verification (postcard/phone/ID) — cannot be no-touch
  | "terms_prohibit_automation" // ToS/captcha make automated submission inappropriate
  | "paid_provider"; // would require a paid recurring service — not enabled

export type CitationTarget = {
  id: string;
  name: string;
  url: string;
  countries: string[]; // ISO codes or "*"
  /** lower-case category keywords this target is relevant for; empty = all businesses */
  industries: string[];
  authority: number; // 0-100 rough value of a consistent listing
  free: boolean;
  automation: Automation;
  reason: string;
};

export const CITATION_TARGETS: CitationTarget[] = [
  { id: "own_site_vs_gbp", name: "Own website vs Google profile (first-party NAP)", url: "", countries: ["*"], industries: [], authority: 100, free: true, automation: "checkable_public_api", reason: "Compares name/phone/address stated on the company's own site against its Google profile and owner-supplied data." },
  { id: "google_business_profile", name: "Google Business Profile", url: "https://business.google.com", countries: ["*"], industries: [], authority: 100, free: true, automation: "checkable_via_connection", reason: "One-time Google authorization lets GravyBlock read the profile; profile edits are not auto-applied." },
  { id: "yelp", name: "Yelp", url: "https://www.yelp.com", countries: ["US", "CA", "GB", "AU"], industries: [], authority: 85, free: true, automation: "checkable_public_api", reason: "Yelp Fusion match detects the listing and compares NAP. Claiming/editing requires the owner's Yelp login, so it is detect-only." },
  { id: "facebook_page", name: "Facebook Page", url: "https://www.facebook.com", countries: ["*"], industries: [], authority: 75, free: true, automation: "checkable_via_connection", reason: "With the Page access the owner authorized once, GravyBlock reads Page details and compares NAP." },
  { id: "bing_places", name: "Bing Places", url: "https://www.bingplaces.com", countries: ["*"], industries: [], authority: 80, free: true, automation: "verification_required", reason: "Requires the owner to sign in and verify (phone/postcard/email)." },
  { id: "apple_business_connect", name: "Apple Business Connect", url: "https://businessconnect.apple.com", countries: ["*"], industries: [], authority: 80, free: true, automation: "verification_required", reason: "Requires an owner Apple ID and verification." },
  { id: "foursquare", name: "Foursquare", url: "https://foursquare.com", countries: ["*"], industries: [], authority: 65, free: true, automation: "verification_required", reason: "Claiming requires owner verification; bulk submission is a paid data product." },
  { id: "bbb", name: "Better Business Bureau", url: "https://www.bbb.org", countries: ["US", "CA"], industries: [], authority: 70, free: true, automation: "verification_required", reason: "Profile changes go through BBB review and owner verification." },
  { id: "yellow_pages", name: "Yellow Pages (YP.com)", url: "https://www.yellowpages.com", countries: ["US"], industries: [], authority: 55, free: true, automation: "terms_prohibit_automation", reason: "Claim flow uses phone/email verification and captcha; automated submission is not appropriate." },
  { id: "manta", name: "Manta", url: "https://www.manta.com", countries: ["US"], industries: [], authority: 50, free: true, automation: "terms_prohibit_automation", reason: "Claim flow requires email verification and captcha." },
  { id: "nextdoor", name: "Nextdoor Business", url: "https://business.nextdoor.com", countries: ["US"], industries: [], authority: 50, free: true, automation: "verification_required", reason: "Requires owner account and address verification." },
  { id: "angi", name: "Angi / HomeAdvisor", url: "https://www.angi.com", countries: ["US"], industries: ["plumb", "hvac", "electric", "roof", "contractor", "landscap", "clean"], authority: 70, free: false, automation: "paid_provider", reason: "Lead-marketplace with paid placement; not enabled." },
  { id: "houzz", name: "Houzz", url: "https://www.houzz.com", countries: ["US", "CA", "GB", "AU"], industries: ["contractor", "design", "remodel", "landscap"], authority: 60, free: true, automation: "verification_required", reason: "Professional accounts require owner verification." },
  { id: "healthgrades", name: "Healthgrades / Zocdoc / Vitals", url: "https://www.healthgrades.com", countries: ["US"], industries: ["dent", "doctor", "chiro", "health", "med", "clinic"], authority: 70, free: true, automation: "verification_required", reason: "Provider profiles require credential verification." },
  { id: "avvo_justia", name: "Avvo / Justia / FindLaw", url: "https://www.avvo.com", countries: ["US"], industries: ["law", "attorney", "legal"], authority: 70, free: true, automation: "verification_required", reason: "Attorney profiles require bar-number verification." },
  { id: "data_aggregators", name: "Data aggregators (Data Axle, Localeze, Foursquare data)", url: "", countries: ["US"], industries: [], authority: 90, free: false, automation: "paid_provider", reason: "Would push listings to hundreds of directories but is a paid recurring service (Yext/BrightLocal-style). Identified, not enabled." },
];

export function targetsFor(category: string | null | undefined, country = "US"): CitationTarget[] {
  const cat = (category ?? "").toLowerCase();
  return CITATION_TARGETS.filter(
    (t) =>
      (t.countries.includes("*") || t.countries.includes(country)) &&
      (t.industries.length === 0 || t.industries.some((k) => cat.includes(k))),
  );
}
