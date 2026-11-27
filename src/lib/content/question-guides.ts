import type { SeoPageModel } from "@/components/seo-content-page";

export type QuestionGuide = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  model: SeoPageModel;
};

const related = [
  { href: "/guides", label: "All guides" },
  { href: "/guides/website-trust-signals", label: "Website trust signals and local conversion" },
  { href: "/examples/sample-local-growth-report", label: "Sample local growth report" },
];

/**
 * Question guides that are kept as their own pages. Short, overlapping question pages (calls from a Business Profile, near-me conversion,
 * local trust, AI search, location pages and the four use-case guides) were merged into the full guides below and into the standalone
 * guides, and their old URLs 301 to those (see lib/seo/merged-urls.ts).
 */
export const QUESTION_GUIDES: Record<string, QuestionGuide> = {
  "how-to-rank-higher-in-google-maps": {
    slug: "how-to-rank-higher-in-google-maps",
    metaTitle: "How to rank higher in Google Maps, and get more calls from your profile",
    metaDescription: "What Google says decides local rankings, and the practical profile, website and review steps that improve Maps visibility and turn it into calls.",
    model: {
      eyebrow: "Question guide",
      title: "How to rank higher in Google Maps (and turn it into calls)",
      directAnswer: "Google says local results are based mainly on relevance, distance and prominence. You cannot change distance, but you can improve relevance with a complete, accurate Business Profile and a website that confirms it, and prominence with genuine reviews, consistent listings and real local mentions.",
      intro: "There is no hack that moves a business up the map. What works is a profile that is complete and accurate, a website that agrees with it, a steady flow of real reviews, and a way for people to contact you the moment they decide to.",
      meaningForBusiness: "Maps visibility is only worth something if it becomes calls, directions and bookings, so the same steps that improve ranking should also make the profile easier to act on.",
      sections: [
        {
          title: "Know what Google says it is ranking",
          body: "Google describes local ranking as a mix of relevance (how well your profile matches what was searched), distance (how far you are from the searcher or the place they named) and prominence (how well known and trusted you appear, using things like reviews, links and information from across the web). Distance is outside your control, so your effort belongs on relevance and prominence, and on being found for the searches that match what you really do.",
        },
        {
          title: "Complete the profile properly",
          body: "Start with the fields people and Google both read, and keep them accurate.",
          bullets: [
            "Choose the primary category that best matches your main service, then add secondary categories only for services you genuinely offer.",
            "List your services, products or menu with plain descriptions, and keep opening hours exact, including holidays and special hours.",
            "Use your real business name. Adding keywords or a city to the name breaks Google's guidelines and can get the profile suspended.",
            "Add photos of your premises, team and work, and keep adding them. Real photos earn more trust than stock images.",
            "Post updates and offers regularly so the profile shows that the business is active.",
          ],
        },
        {
          title: "Make the website confirm the profile",
          body: "Your site should repeat the same name, address, phone number, services and hours as the profile, and give each core service or location its own clear page. Link the profile to the most relevant page, not always the homepage. When the site and the profile disagree, search systems have to guess, and visitors lose confidence. See the guide on website trust signals for the checks that most often fail.",
        },
        {
          title: "Build prominence with real signals",
          body: "Prominence comes from being trusted by customers and by other sources.",
          bullets: [
            "Reviews: ask every satisfied customer and keep the flow steady. Recent, specific reviews help both ranking and conversion (see the guide on getting more Google reviews).",
            "Citations: keep your name, address and phone number identical on the major directories and the sites that matter in your trade.",
            "Local mentions: sponsorships, partners, suppliers, chambers of commerce and local press that link to you are worth more than a pile of low-quality directory entries.",
          ],
        },
        {
          title: "Know which part of the results page you are working on",
          body: "The map pack (the Google 3-Pack) is won on your Business Profile, the regular organic results below it are won on your website, and the 'Sponsored' results are paid ads. The 3-Pack guide compares the three side by side: what appears in each, what decides placement and what you control.",
        },
        {
          title: "Turn visibility into calls",
          body: "Ranking gets you seen, and the profile and site have to get you contacted. Make sure the call button works and the number is right, answer or return calls quickly, switch messaging on only if you can reply promptly, and put a tap-to-call number and today's hours at the top of the page the profile links to. Check the Business Profile performance figures for calls, direction requests and website visits, and look at them month by month rather than day by day.",
        },
        {
          title: "What to avoid",
          body: "Do not buy reviews, create profiles for places where you have no staffed premises, stuff keywords into the name or description, or duplicate profiles for the same address. These shortcuts can lead to suspension, which costs far more than any gain. Results also take time: changes to a profile and its reviews usually show up over weeks, not days.",
        },
      ],
      relatedLinks: [{ href: "/guides/google-3-pack", label: "The Google 3-Pack vs organic results vs Google Ads" }, ...related],
    },
  },
  "how-to-get-more-google-reviews": {
    slug: "how-to-get-more-google-reviews",
    metaTitle: "How to get more Google reviews for your local business",
    metaDescription: "When to ask, how to make it easy, what the rules allow, and how to respond, so a steady flow of genuine Google reviews builds trust and visibility.",
    model: {
      eyebrow: "Question guide",
      title: "How to get more Google reviews",
      directAnswer: "Get more Google reviews by asking every satisfied customer soon after the job, making it easy with a direct review link, never offering rewards or screening who you ask, and responding to the reviews you already have.",
      intro: "Reviews are the most visible trust signal in local search and the easiest one to improve with steady, honest effort. The goal is a regular flow of recent, specific reviews from real customers, not a one-off burst.",
      meaningForBusiness: "More recent, genuine reviews help people choose you and support your visibility in Google Maps, and how you answer them shows future customers what to expect.",
      sections: [
        {
          title: "Ask at the right moment",
          body: "The best time to ask is right after a job is done or a visit has gone well, when the experience is fresh and the customer is happy. Waiting days lowers the number who follow through. Make asking part of the routine: add it to the checklist for closing a job, the receipt, the appointment follow-up or the handover, and make sure every member of the team knows how to ask in a sentence or two.",
        },
        {
          title: "Make it take under a minute",
          body: "Every extra step costs reviews, so remove them.",
          bullets: [
            "Use the review link from your Google Business Profile (the 'Get more reviews' option) so the customer lands directly on the review box.",
            "Send it by text message or email straight after the job, with one short sentence and the link. A printed QR code works in places where customers are still on site, such as a counter, an invoice or a leaflet left behind.",
            "Tell customers that a few honest words about what you did and how it went is plenty. Specific reviews help later customers more than long ones.",
          ],
        },
        {
          title: "Stay inside the rules",
          body: "Google's review policies prohibit several shortcuts that businesses are tempted by. Do not offer discounts, gifts or payment in return for reviews, do not ask only happy customers while steering unhappy ones elsewhere (review gating), do not write or buy reviews, and do not review your own business or competitors. In the United States, rules on fake and incentivised reviews also apply. Reviews that break the rules can be removed and can put the profile at risk, so ask everyone, accept what they say, and let the ratings be real.",
        },
        {
          title: "Respond to every review",
          body: "Reply to the reviews you already have, positive and negative, in a calm and specific way. Thank people by name and mention something about their visit. For a negative review, apologise for the experience without arguing, state briefly what you will do or have done, and offer an offline way to resolve it. Future customers read the replies as closely as the reviews, and a considered response to criticism often builds more trust than a spotless score. If a review breaks Google's policy (spam, off-topic or fake), flag it for removal instead of arguing in public.",
        },
        {
          title: "Use what the reviews tell you",
          body: "Read your reviews for repeating themes: a slow response, a confusing price, a rude moment or a service people keep praising. Fix the problems in operations and put the strengths in your website and profile. Ask for reviews on the other sites that matter in your trade as well, since some customers check those rather than Google.",
        },
        {
          title: "Keep it steady",
          body: "A small, steady flow beats a burst. Aim for a regular number of new reviews each week or month that matches the volume of customers you serve, and track the count and recency alongside your calls and direction requests. If reviews stall, the cause is usually that the ask stopped being part of the routine.",
        },
      ],
      relatedLinks: related,
    },
  },
};

export const QUESTION_GUIDE_SLUGS = Object.keys(QUESTION_GUIDES);
