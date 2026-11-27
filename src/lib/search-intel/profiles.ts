/**
 * What each house site is FOR, so recommendations aim at its real audience and conversions instead of generic SEO hygiene.
 * Written from each site's own Business Truth description (read 2026-11-27) and the owner's stated goals. The live Business Truth description is still read at
 * report time and shown alongside, so a site that changes its offer is not judged by a stale profile.
 *
 * - seeds: searches the site's audience plausibly makes, used ONLY to ask public autocomplete what people actually type (never as a claimed search volume)
 * - topicWords: words a genuine competitor's pages would use; competitors whose pages do not cover them are rejected however famous they are
 * - conversions: what a qualified visitor should do next, in the site's own terms
 * - valuableSections: URL sections that carry the business (weighted up in ranking)
 */
export type SiteProfile = {
  what: string;
  audience: string;
  conversions: string[];
  seeds: string[];
  topicWords: string[];
  valuableSections: string[];
  seasonal?: Array<{ months: number[]; topic: string }>;
};

export const SITE_PROFILES: Record<string, SiteProfile> = {
  "The Drink Place": {
    what: "drink and venue discovery: where to get a specific drink, verified happy hours, drink menus, venue pages",
    audience: "people deciding where to go for a drink tonight or this week, and venue owners who want to claim and manage their listing",
    conversions: ["account registration", "venue claim (venue owners)", "searching for a drink or venue"],
    seeds: ["happy hour near me", "happy hour chicago", "best old fashioned near me", "cocktail bars open late", "drink specials tonight", "bars with happy hour today", "where to get a margarita near me", "claim my bar listing"],
    topicWords: ["bar", "bars", "happy-hour", "happy", "cocktail", "cocktails", "drink", "drinks", "brewery", "taproom", "wine", "pub", "lounge", "nightlife", "menu"],
    valuableSections: ["/places", "/happy-hour", "/business", "/drink", "/cities", "/chicago"],
  },
  "Boating Chicago": {
    what: "Chicago boating guide: lakes, boat launches, marinas, conditions, destinations, boating tools, plus rental and charter referrals",
    audience: "Chicago-area boaters and people planning a boat day, rental or charter",
    conversions: ["rental or charter referral", "newsletter subscription", "using a boating tool (float plan, checklist, weather)"],
    seeds: ["chicago boat launch", "boat launches near chicago", "chicago marinas", "lake michigan boating conditions", "chain o lakes boating", "boat rental chicago", "chicago harbor transient dockage", "illinois boating rules"],
    topicWords: ["boat", "boating", "marina", "marinas", "launch", "harbor", "lake", "charter", "yacht", "sailing", "fishing", "dock", "kayak", "paddle", "river"],
    valuableSections: ["/boat-launches", "/marinas", "/lakes", "/destinations", "/tools", "/weather", "/forest-preserves"],
    seasonal: [{ months: [3, 4, 5], topic: "boating season opening: launches, marinas, slips, rentals" }],
  },
  "Drink Knird": {
    what: "recipes, cocktails and seasonal cooking content",
    audience: "home cooks and home bartenders looking for a recipe right now, strongly seasonal",
    conversions: ["affiliate product clicks", "newsletter subscription", "return visits"],
    seeds: ["turkey brine recipe", "holiday cocktails", "christmas cocktail recipes", "new years eve cocktails", "mulled wine recipe", "eggnog recipe", "espresso martini recipe", "mocktail recipes"],
    topicWords: ["recipe", "recipes", "cocktail", "cocktails", "drink", "brine", "cook", "cooking", "kitchen", "bake", "dinner"],
    valuableSections: ["/"],
    seasonal: [{ months: [11, 12], topic: "Thanksgiving, holiday and New Year drinks and recipes" }, { months: [5, 6, 7], topic: "summer cocktails and grilling" }],
  },
  "Outbreak Threat": {
    what: "public-health intelligence: official outbreak and recall notices mapped by location with plain-English summaries",
    audience: "people checking whether an outbreak or recall affects them, and readers who want alerts",
    conversions: ["alert/newsletter subscription", "return visits to maps"],
    seeds: ["norovirus outbreak map", "flu outbreak map", "measles outbreak 2026", "food recall today", "bird flu cases map", "salmonella outbreak", "covid cases near me", "stomach bug going around"],
    topicWords: ["outbreak", "outbreaks", "virus", "disease", "recall", "norovirus", "measles", "flu", "influenza", "salmonella", "health", "cases", "map"],
    valuableSections: ["/"],
    seasonal: [{ months: [11, 12, 1, 2, 3], topic: "norovirus and flu season" }],
  },
  GravyBlock: {
    what: "automated local SEO for small businesses: free visibility scan, then subscription plans",
    audience: "small local business owners trying to get found on Google and maps",
    conversions: ["free scan completed", "subscription started"],
    seeds: ["free local seo audit", "google business profile checker", "how to rank higher on google maps", "local seo tool for small business", "local seo checklist", "why is my business not showing on google maps"],
    topicWords: ["seo", "local", "google", "business", "profile", "maps", "ranking", "audit", "citations", "reviews"],
    valuableSections: ["/scan", "/tools", "/guides", "/local-seo", "/pricing"],
  },
  "League Pour": {
    what: "venue competition software for bars: run leagues, trivia and tournaments to fill seats",
    audience: "bar and venue owners running competitions, and players looking for leagues",
    conversions: ["venue sign-up", "player sign-up"],
    seeds: ["bar league software", "trivia night software", "cornhole league app", "dart league software", "pool league management app", "bar tournament bracket app", "how to start a bar league"],
    topicWords: ["league", "leagues", "trivia", "tournament", "bracket", "darts", "cornhole", "pool", "billiards", "bar", "venue", "players"],
    valuableSections: ["/features", "/for-venues", "/guides", "/pricing"],
  },
  "Mic Stage": {
    what: "open mic discovery for artists and slot scheduling for venues",
    audience: "comedians, musicians and poets looking for open mics, and venues running them",
    conversions: ["artist sign-up / slot reservation", "venue schedule published"],
    seeds: ["open mic near me", "open mic tonight", "comedy open mic near me", "open mic chicago", "open mic sign up sheet", "how to run an open mic"],
    topicWords: ["open-mic", "open", "mic", "comedy", "poetry", "music", "venue", "stage", "slot", "performers"],
    valuableSections: ["/open-mics", "/venues", "/"],
  },
  "Rental Noodle": {
    what: "property management software for independent landlords: tenant portal, rent tools, vacancy listings",
    audience: "small independent landlords",
    conversions: ["landlord sign-up"],
    seeds: ["free property management software for small landlords", "tenant portal for landlords", "rent collection app for landlords", "landlord software free", "rental property calculator", "how to screen tenants"],
    topicWords: ["landlord", "landlords", "tenant", "tenants", "rent", "rental", "property", "lease", "management", "vacancy"],
    valuableSections: ["/sign-up", "/features", "/tools", "/guides"],
  },
  SeeStew: {
    what: "American history stories: long-form videos and articles about hidden history",
    audience: "history enthusiasts who watch and read long-form stories",
    conversions: ["video views and channel follows", "return visits"],
    seeds: ["untold american history stories", "hidden history facts", "strange american history", "forgotten history events"],
    topicWords: ["history", "historical", "american", "story", "stories", "war", "president", "century", "hidden", "untold"],
    valuableSections: ["/"],
  },
  "Send Fable": {
    what: "simple email marketing for small businesses without paying for CRM features",
    audience: "small business owners sending newsletters and promotions",
    conversions: ["account sign-up"],
    seeds: ["email marketing for small business", "cheap email marketing", "mailchimp alternative for small business", "email newsletter for real estate", "simple email marketing tool"],
    topicWords: ["email", "newsletter", "marketing", "campaign", "subscribers", "list", "smtp", "mailchimp"],
    valuableSections: ["/signup", "/email-marketing", "/pricing"],
  },
  "Venue Sprocket": {
    what: "event sales software for restaurants, breweries, bars and event spaces: inquiries, proposals, contracts, deposits, BEOs",
    audience: "venue and event managers who sell private events",
    conversions: ["demo or account sign-up"],
    seeds: ["event venue management software", "brewery private event booking", "beo software for restaurants", "private dining booking software", "event proposal software for venues"],
    topicWords: ["event", "events", "venue", "venues", "booking", "beo", "catering", "private", "proposal", "inquiry", "wedding"],
    valuableSections: ["/", "/features", "/pricing"],
  },
  "iScream Studio": {
    what: "small-business websites, SEO and AEO content systems, plus the studio's own games",
    audience: "small business owners wanting one team for web, SEO and automation; players of the studio's games",
    conversions: ["inquiry / contact", "game follows"],
    seeds: ["small business website design and seo", "aeo services", "answer engine optimization agency", "local seo and website package"],
    topicWords: ["website", "design", "seo", "aeo", "agency", "marketing", "automation", "games", "studio"],
    valuableSections: ["/", "/games"],
  },
};

export const profileFor = (name: string): SiteProfile | null => SITE_PROFILES[name] ?? null;
