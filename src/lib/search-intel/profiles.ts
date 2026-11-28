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
  /** how this site should meet new demand with what it already has */
  demandHint?: string;
  seasonal?: Array<{ months: number[]; topic: string }>;
  /** what growth means for this site, in order: recommendations are weighed against it */
  priorities?: string[];
  /** words in a search or URL that point at the site's money pages or core intents (weighted up as business value) */
  valueWords?: string[];
  /**
   * Candidate competitor sites for the site's main intents. Never trusted as given: each is kept only if its own sitemap shows pages on this site's topic
   * (see competitorRelevance), and rejected ones are listed as rejected in the report.
   */
  competitorCandidates?: string[];
};

export const SITE_PROFILES: Record<string, SiteProfile> = {
  "The Drink Place": {
    priorities: ["verified drinks and drink specials people can act on tonight", "happy hours by city and neighbourhood", "venue discovery pages that are worth indexing", "venue owners claiming their listing", "account registrations"],
    valueWords: ["happy", "hour", "special", "drink", "cocktail", "bar", "rooftop", "tonight", "near", "claim", "menu"],
    competitorCandidates: ["https://wherestherooftop.com", "https://www.theinfatuation.com", "https://chicago.eater.com", "https://www.timeout.com", "https://www.chicagomag.com"],
    demandHint: "Answer it with the venue data the site already has (verified hours, happy-hour times, drinks): for example a city or neighbourhood list filtered by what is open or on special, not a generic article.",
    what: "drink and venue discovery: where to get a specific drink, verified happy hours, drink menus, venue pages",
    audience: "people deciding where to go for a drink tonight or this week, and venue owners who want to claim and manage their listing",
    conversions: ["account registration", "venue claim (venue owners)", "searching for a drink or venue"],
    seeds: ["happy hour near me", "happy hour chicago", "best old fashioned near me", "cocktail bars open late", "drink specials tonight", "bars with happy hour today", "where to get a margarita near me", "rooftop bars chicago"],
    // alcohol and bar words only: "drink" and "menu" alone would let coffee chains through
    topicWords: ["bar", "bars", "happy-hour", "happy", "hour", "specials", "cocktail", "cocktails", "brewery", "breweries", "taproom", "wine", "pub", "pubs", "lounge", "nightlife", "beer", "whiskey", "tequila", "spirits", "margarita", "rooftop"],
    valuableSections: ["/places", "/happy-hour", "/business", "/drink", "/cities", "/chicago"],
  },
  "Boating Chicago": {
    priorities: ["boating destinations people can plan a day around", "boat launch details (location, fees, hours, parking)", "lake and Lake Michigan conditions before going out", "marinas and harbors (slips, transient dockage)", "boating tools (float plan, checklist, weather)"],
    valueWords: ["launch", "ramp", "marina", "harbor", "conditions", "lake", "boat", "rental", "charter", "dock", "slip", "destination"],
    competitorCandidates: ["https://www.chicagoharbors.info", "https://www.takemefishing.org", "https://www.boatsetter.com", "https://www.getmyboat.com", "https://www.chicagoparkdistrict.com"],
    demandHint: "Answer it with the site's own launch, marina, lake and conditions data: for example a filtered directory or comparison with verified details, not a generic article.",
    what: "Chicago boating guide: lakes, boat launches, marinas, conditions, destinations, boating tools, plus rental and charter referrals",
    audience: "Chicago-area boaters and people planning a boat day, rental or charter",
    conversions: ["rental or charter referral", "newsletter subscription", "using a boating tool (float plan, checklist, weather)"],
    seeds: ["chicago boat launch", "boat launches near chicago", "chicago marinas", "lake michigan boating conditions", "chain o lakes boating", "boat rental chicago", "chicago harbor transient dockage", "illinois boating rules"],
    topicWords: ["boat", "boating", "marina", "marinas", "launch", "harbor", "lake", "conditions", "charter", "yacht", "sailing", "fishing", "dock", "kayak", "paddle", "river"],
    valuableSections: ["/boat-launches", "/marinas", "/lakes", "/destinations", "/tools", "/weather", "/forest-preserves"],
    seasonal: [{ months: [3, 4, 5], topic: "boating season opening: launches, marinas, slips, rentals" }],
  },
  "Drink Knird": {
    priorities: ["tested recipes published ahead of their seasonal peak", "cocktail and mocktail recipes people make at home", "return visits and newsletter sign-ups"],
    valueWords: ["recipe", "cocktail", "mocktail", "holiday", "christmas", "thanksgiving", "punch", "brine"],
    competitorCandidates: ["https://www.liquor.com", "https://punchdrink.com", "https://www.diffordsguide.com", "https://www.allrecipes.com"],
    demandHint: "Answer it with a genuinely tested recipe in the site's existing recipe format, published ahead of the seasonal peak.",
    what: "recipes, cocktails and seasonal cooking content",
    audience: "home cooks and home bartenders looking for a recipe right now, strongly seasonal",
    conversions: ["affiliate product clicks", "newsletter subscription", "return visits"],
    seeds: ["turkey brine recipe", "holiday cocktails", "christmas cocktail recipes", "new years eve cocktails", "mulled wine recipe", "eggnog recipe", "espresso martini recipe", "mocktail recipes"],
    topicWords: ["recipe", "recipes", "cocktail", "cocktails", "drink", "brine", "cook", "cooking", "kitchen", "bake", "dinner"],
    valuableSections: ["/"],
    seasonal: [{ months: [11, 12], topic: "Thanksgiving, holiday and New Year drinks and recipes" }, { months: [5, 6, 7], topic: "summer cocktails and grilling" }],
  },
  "Outbreak Threat": {
    priorities: ["timely outbreak and recall pages backed by official sources", "maps people return to during an outbreak season", "alert sign-ups"],
    valueWords: ["outbreak", "map", "recall", "cases", "norovirus", "flu", "measles", "salmonella", "near"],
    competitorCandidates: ["https://www.cidrap.umn.edu", "https://www.foodsafetynews.com", "https://www.outbreaknewstoday.com"],
    demandHint: "Answer it with the site's existing official-source data: a focused map or tracker page for that disease or recall, updated from the same feeds.",
    what: "public-health intelligence: official outbreak and recall notices mapped by location with plain-English summaries",
    audience: "people checking whether an outbreak or recall affects them, and readers who want alerts",
    conversions: ["alert/newsletter subscription", "return visits to maps"],
    seeds: ["norovirus outbreak map", "flu outbreak map", "measles outbreak 2026", "food recall today", "bird flu cases map", "salmonella outbreak", "covid cases near me", "stomach bug going around"],
    topicWords: ["outbreak", "outbreaks", "virus", "disease", "recall", "norovirus", "measles", "flu", "influenza", "salmonella", "health", "cases", "map"],
    valuableSections: ["/"],
    seasonal: [{ months: [11, 12, 1, 2, 3], topic: "norovirus and flu season" }],
  },
  GravyBlock: {
    priorities: ["searches by small business owners trying to get found on Google and Maps", "free tools and the free scan as the first step", "paid subscriptions"],
    valueWords: ["seo", "google", "maps", "business", "profile", "ranking", "audit", "checker", "tool", "local", "free"],
    competitorCandidates: ["https://www.brightlocal.com", "https://whitespark.ca", "https://www.localfalcon.com", "https://www.yext.com"],
    demandHint: "Answer it by pointing to the free scan or a focused free tool, so the searcher can act immediately.",
    what: "automated local SEO for small businesses: free visibility scan, then subscription plans",
    audience: "small local business owners trying to get found on Google and maps",
    conversions: ["free scan completed", "subscription started"],
    seeds: ["free local seo audit", "google business profile checker", "how to rank higher on google maps", "local seo tool for small business", "local seo checklist", "why is my business not showing on google maps"],
    topicWords: ["seo", "local", "google", "business", "profile", "maps", "ranking", "audit", "citations", "citation", "reviews", "checker"],
    valuableSections: ["/scan", "/tools", "/guides", "/local-seo", "/pricing"],
  },
  "League Pour": {
    priorities: ["bar and venue owners looking for league, trivia and tournament software", "players looking for a league", "venue sign-ups"],
    valueWords: ["league", "trivia", "tournament", "bracket", "software", "app", "darts", "cornhole", "pool"],
    competitorCandidates: ["https://www.leaguelobster.com", "https://challonge.com", "https://www.leagueapps.com"],
    what: "venue competition software for bars: run leagues, trivia and tournaments to fill seats",
    audience: "bar and venue owners running competitions, and players looking for leagues",
    conversions: ["venue sign-up", "player sign-up"],
    seeds: ["bar league software", "trivia night software", "cornhole league app", "dart league software", "pool league management app", "bar tournament bracket app", "how to start a bar league"],
    topicWords: ["league", "leagues", "trivia", "tournament", "bracket", "darts", "cornhole", "pool", "billiards", "bar", "venue", "players"],
    valuableSections: ["/features", "/for-venues", "/guides", "/pricing"],
  },
  "Mic Stage": {
    priorities: ["performers finding an open mic tonight or this week", "city open mic listings", "venues publishing their open mic schedule"],
    valueWords: ["open", "mic", "comedy", "poetry", "tonight", "near", "sign"],
    competitorCandidates: ["https://www.badslava.com", "https://www.openmikes.org"],
    what: "open mic discovery for artists and slot scheduling for venues",
    audience: "comedians, musicians and poets looking for open mics, and venues running them",
    conversions: ["artist sign-up / slot reservation", "venue schedule published"],
    seeds: ["open mic near me", "open mic tonight", "comedy open mic near me", "open mic chicago", "open mic sign up sheet", "how to run an open mic"],
    topicWords: ["open-mic", "open", "mic", "comedy", "poetry", "music", "venue", "stage", "slot", "performers"],
    valuableSections: ["/open-mics", "/venues", "/"],
  },
  "Rental Noodle": {
    priorities: ["independent landlords comparing free property management tools", "landlord calculators and how-to resources that lead to sign-up", "landlord sign-ups"],
    valueWords: ["landlord", "tenant", "rent", "rental", "property", "lease", "calculator", "software", "free", "screen"],
    competitorCandidates: ["https://www.turbotenant.com", "https://www.avail.co", "https://www.baselane.com", "https://rentredi.com"],
    what: "property management software for independent landlords: tenant portal, rent tools, vacancy listings",
    audience: "small independent landlords",
    conversions: ["landlord sign-up"],
    seeds: ["free property management software for small landlords", "tenant portal for landlords", "rent collection app for landlords", "landlord software free", "rental property calculator", "how to screen tenants"],
    topicWords: ["landlord", "landlords", "tenant", "tenants", "rent", "rental", "property", "lease", "management", "vacancy"],
    valuableSections: ["/sign-up", "/features", "/tools", "/guides"],
  },
  SeeStew: {
    priorities: ["history stories people search for by name or event", "video views and return visits"],
    valueWords: ["history", "story", "facts", "untold", "forgotten"],
    competitorCandidates: ["https://www.historynet.com", "https://allthatsinteresting.com"],
    what: "American history stories: long-form videos and articles about hidden history",
    audience: "history enthusiasts who watch and read long-form stories",
    conversions: ["video views and channel follows", "return visits"],
    seeds: ["untold american history stories", "hidden history facts", "strange american history", "forgotten history events"],
    topicWords: ["history", "historical", "american", "story", "stories", "war", "president", "century", "hidden", "untold"],
    valuableSections: ["/"],
  },
  "Send Fable": {
    priorities: ["small businesses choosing a simple, affordable email marketing tool", "comparisons with better-known tools", "account sign-ups"],
    valueWords: ["email", "newsletter", "marketing", "alternative", "cheap", "free", "small", "business"],
    competitorCandidates: ["https://www.mailerlite.com", "https://www.sender.net", "https://www.moosend.com"],
    what: "simple email marketing for small businesses without paying for CRM features",
    audience: "small business owners sending newsletters and promotions",
    conversions: ["account sign-up"],
    seeds: ["email marketing for small business", "cheap email marketing", "mailchimp alternative for small business", "email newsletter for real estate", "simple email marketing tool"],
    topicWords: ["email", "newsletter", "marketing", "campaign", "subscribers", "list", "smtp", "mailchimp"],
    valuableSections: ["/signup", "/email-marketing", "/pricing"],
  },
  "Venue Sprocket": {
    priorities: ["venue and event managers looking for event sales software", "private event booking and BEO workflows", "demo and account sign-ups"],
    valueWords: ["event", "venue", "booking", "beo", "private", "software", "proposal", "catering"],
    competitorCandidates: ["https://tripleseat.com", "https://www.perfectvenue.com", "https://www.eventtemple.com"],
    what: "event sales software for restaurants, breweries, bars and event spaces: inquiries, proposals, contracts, deposits, BEOs",
    audience: "venue and event managers who sell private events",
    conversions: ["demo or account sign-up"],
    seeds: ["event venue management software", "brewery private event booking", "beo software for restaurants", "private dining booking software", "event proposal software for venues"],
    topicWords: ["event", "events", "venue", "venues", "booking", "beo", "catering", "private", "proposal", "inquiry", "wedding"],
    valuableSections: ["/", "/features", "/pricing"],
  },
  "iScream Studio": {
    priorities: ["small business owners looking for website, SEO and AEO help", "inquiries", "players of the studio's games"],
    valueWords: ["website", "seo", "aeo", "agency", "design", "small", "business", "game"],
    what: "small-business websites, SEO and AEO content systems, plus the studio's own games",
    audience: "small business owners wanting one team for web, SEO and automation; players of the studio's games",
    conversions: ["inquiry / contact", "game follows"],
    seeds: ["small business website design and seo", "aeo services", "answer engine optimization agency", "local seo and website package"],
    topicWords: ["website", "design", "seo", "aeo", "agency", "marketing", "automation", "games", "studio"],
    valuableSections: ["/", "/games"],
  },
};

export const profileFor = (name: string): SiteProfile | null => SITE_PROFILES[name] ?? null;
