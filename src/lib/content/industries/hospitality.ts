import type { IndustryPageModel } from "./types";

export const hospitalityPage: IndustryPageModel = {
  metaTitle: "Restaurants, bars, breweries, and cafes: maps-first readiness | GravyBlock",
  metaDescription:
    "Hospitality operators: tighten Google profiles, websites, and reviews before guests decide. Free GravyBlock scan plus deep dives for restaurants, bars, and breweries.",
  eyebrow: "Hospitality",
  h1: "Restaurants, bars, and cafes: win the map moment and the menu click",
  intro:
    "Hospitality is fiercely local and review-driven. Guests decide on hours accuracy, dietary signals, photos that look like tonight’s service, and whether booking or walk-in matches reality. GravyBlock scores listing and website readiness plus reputation context so operators can prioritize fixes that move covers, not vanity metrics.",
  whyFit:
    "You already move fast on promos and menus. GravyBlock gives a structured baseline: where your Google story, site, and trust signals disagree, and what to fix first before you spend on ads.",
  winCustomers: [
    "Profiles with menus, attributes, and photos aligned to how the room actually runs.",
    "Sites that load fast on LTE and route to reservations, waitlists, or call.",
    "Reviews and responses that show hospitality tone under pressure.",
    "Consistent facts so assistants recommend the right concept, hours, and dietary notes.",
  ],
  commonWeaknesses: [
    "Holiday hours updated on Instagram but not on Google.",
    "Delivery and pickup toggles that contradict in-house POS hours.",
    "Wine lists or allergen notes that differ between PDF and site.",
    "Taproom or patio seating promises that ignore weather realities.",
  ],
  profileBody:
    "Your profile is the menu board outside the internet. Categories, attributes, and popular times should match staffing and kitchen reality.",
  websiteBody:
    "After the map tap, guests still open your site for private events, large parties, and dietary proof. Trust is photos, PDFs, and mobile UX that do not fight each other.",
  aiBody:
    "Assistants summarize what they can trust. If brunch hours differ across site, profile, and schema, you become the risky pick.",
  scanHelps: [
    "Readiness score and verdict with prioritized listing and site findings.",
    "Top issues before unlock; full report sections after email capture.",
    "Workspace path for ongoing monitoring with Base or Pro.",
  ],
  ongoingBody:
    "Base adds monthly monitoring and summaries. Pro increases refresh cadence and opens workspace queues for content, citations, and reviews where supported.",
  relatedGuides: [
    { href: "/guides/social-proof-and-local-conversion", label: "Social proof and local conversion" },
    { href: "/guides/website-trust-signals", label: "Website trust signals" },
    { href: "/guides/ai-search-local-businesses", label: "AI search for local businesses" },
    { href: "/guides/multi-location-local-seo", label: "Multi-location local SEO" },
  ],
  extraLinks: [
    { href: "/for-restaurants", label: "GravyBlock for restaurants" },
    { href: "/for-bars", label: "GravyBlock for bars" },
    { href: "/for-breweries", label: "GravyBlock for breweries and taprooms" },
  ],
  trades: [
    {
      id: "restaurants",
      title: "Restaurants",
      intro:
        "Covers depend on reservation fairness, dietary clarity, and wait-time honesty. Align promos with kitchen capacity.",
      bullets: [
        "Menu links that resolve on mobile without PDF traps.",
        "Dietary icons that match training and cross-contact reality.",
        "Parking and pickup bays described the way valets experience them.",
      ],
    },
    {
      id: "bars",
      title: "Bars",
      intro:
        "Late hours, cover charges, and age policies need zero ambiguity. Music genre cues help the right crowd self-select.",
      bullets: [
        "Event calendars synced with door staff knowledge.",
        "Kitchen or food truck partnerships spelled when food is core.",
        "Responsible service tone in responses without sounding robotic.",
      ],
    },
    {
      id: "breweries",
      title: "Breweries and taprooms",
      intro:
        "Family and pet policies, food truck schedules, and tour bookings should match signage and staff scripts.",
      bullets: [
        "To-go and shipping rules aligned with local law.",
        "Limited release communication without frustrating fans.",
        "DD and ride-share reminders that feel helpful, not preachy.",
      ],
    },
    {
      id: "taprooms",
      title: "Taprooms (multi-tap concepts)",
      intro:
        "Rotating handles confuse Google if menus are stale. Tie GBP updates to taproom board rhythm.",
      bullets: [
        "Guest Wi-Fi and workspace norms if you welcome laptops.",
        "Flight pricing philosophy clear at the door and online.",
        "Private event minimums consistent with banquet team quotes.",
      ],
    },
    {
      id: "cafes",
      title: "Cafes",
      intro:
        "Remote workers vs grab-and-go guests need different signals. Hours, seating, and outlet rules should match culture.",
      bullets: [
        "Roaster and pastry sourcing stories that match case displays.",
        "Mobile order handoff that matches counter flow.",
        "Breakfast vs lunch menu switch times posted honestly.",
      ],
    },
  ],
};
