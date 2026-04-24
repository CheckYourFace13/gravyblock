import type { SeoPageModel } from "@/components/seo-content-page";

export type QuestionGuide = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  model: SeoPageModel;
};

const related = [
  { href: "/guides", label: "All guides" },
  { href: "/industries", label: "Industry pages" },
  { href: "/examples/sample-local-growth-report", label: "Sample local growth report" },
];

export const QUESTION_GUIDES: Record<string, QuestionGuide> = {
  "how-to-rank-higher-in-google-maps": {
    slug: "how-to-rank-higher-in-google-maps",
    metaTitle: "How to rank higher in Google Maps for local businesses | GravyBlock",
    metaDescription: "Practical steps to improve Google Maps visibility with profile quality, trust signals, and conversion-ready local pages.",
    model: {
      eyebrow: "Question guide",
      title: "How to rank higher in Google Maps",
      intro: "Google Maps visibility improves when your profile facts, trust signals, and local conversion pathways all support each other.",
      meaningForBusiness: "Your ranking chance improves when Google and customers see consistent local relevance and quality signals, not when you chase hacks.",
      sections: [
        { title: "Start with profile quality", body: "Primary categories, services, hours, photos, and recurring updates set the baseline for local relevance." },
        { title: "Make your website confirm your profile", body: "Your homepage and location content should mirror profile facts and clearly route visitors to call, book, or request service." },
        { title: "Strengthen proof signals", body: "Reviews, social mentions, and trust elements influence whether visibility becomes action.", bullets: ["Ask for review quality, not review volume spam.", "Keep NAP details consistent everywhere.", "Respond to reviews in a human and helpful tone."] },
      ],
      relatedLinks: related,
    },
  },
  "how-to-improve-local-trust-on-your-website": {
    slug: "how-to-improve-local-trust-on-your-website",
    metaTitle: "How to improve local trust on your website | GravyBlock",
    metaDescription: "Improve local business website trust with clear contact paths, policy clarity, social proof, and conversion-ready design.",
    model: {
      eyebrow: "Question guide",
      title: "How to improve local trust on your website",
      intro: "Most local traffic arrives skeptical. Trust grows when your site removes uncertainty fast.",
      meaningForBusiness: "Trust improvements reduce bounce and increase calls, form fills, and bookings from the same traffic.",
      sections: [
        { title: "Show clear business identity", body: "Make your name, service areas, phone, and operating details easy to verify above the fold." },
        { title: "Make proof easy to scan", body: "Use authentic reviews, process clarity, and plain-language guarantees without overclaiming." },
        { title: "Reduce conversion friction", body: "Fast mobile pages, visible CTAs, and simple forms raise lead quality.", bullets: ["One primary action per section.", "Mobile-first tap targets.", "Contact details repeated in footer and key pages."] },
      ],
      relatedLinks: related,
    },
  },
  "how-to-show-up-in-ai-search-for-local-businesses": {
    slug: "how-to-show-up-in-ai-search-for-local-businesses",
    metaTitle: "How to show up in AI search for local businesses | GravyBlock",
    metaDescription: "Improve AI-search visibility through clean business facts, trustworthy sources, and easy-to-summarize local pages.",
    model: {
      eyebrow: "Question guide",
      title: "How to show up in AI search for local businesses",
      intro: "AI search tools summarize local options from signals they can verify and reconcile.",
      meaningForBusiness: "If your facts are inconsistent, assistants hesitate to recommend you even when your service quality is strong.",
      sections: [
        { title: "Keep entity facts consistent", body: "Name, categories, location details, and service descriptions should match across profile, website, and key listings." },
        { title: "Publish direct-answer content", body: "Answer common customer questions plainly so assistants can quote and summarize accurately." },
        { title: "Strengthen corroboration", body: "Build consistent proof across reviews, social profiles, and reputable local mentions." },
      ],
      relatedLinks: related,
    },
  },
  "how-to-get-more-calls-from-google-business-profile": {
    slug: "how-to-get-more-calls-from-google-business-profile",
    metaTitle: "How to get more calls from Google Business Profile | GravyBlock",
    metaDescription: "Increase calls from Google Business Profile with stronger profile completion, trust signals, and conversion-ready messaging.",
    model: {
      eyebrow: "Question guide",
      title: "How to get more calls from Google Business Profile",
      intro: "More calls come from profile clarity and confidence, not just more impressions.",
      meaningForBusiness: "When profile details answer urgent questions instantly, more searchers call instead of comparing another listing.",
      sections: [
        { title: "Prioritize the call decision factors", body: "Hours, categories, services, and photos should remove doubt in seconds." },
        { title: "Align website and profile intent", body: "Profile visitors still inspect your site. Make the first screen call-friendly with supporting trust cues." },
        { title: "Fix weak trust signals", body: "Sparse or stale reviews, conflicting details, and thin proof hurt call conversion." },
      ],
      relatedLinks: related,
    },
  },
  "how-to-improve-near-me-conversion": {
    slug: "how-to-improve-near-me-conversion",
    metaTitle: "How to improve near me conversion for local businesses | GravyBlock",
    metaDescription: "Turn near-me search traffic into calls and bookings through clearer trust, relevance, and conversion design.",
    model: {
      eyebrow: "Question guide",
      title: "How to improve near me conversion",
      intro: "Near-me traffic is high intent but impatient. Friction and doubt kill conversion quickly.",
      meaningForBusiness: "Conversion improves when local relevance and trust are visible on both profile and website in under ten seconds.",
      sections: [
        { title: "Match location intent", body: "Use clear city, service area, and access details where searchers can see them quickly." },
        { title: "Strengthen immediate trust", body: "Show proof signals that matter for your category: reviews, credentials, or service guarantees." },
        { title: "Optimize for action", body: "Use one primary CTA and remove extra steps.", bullets: ["Call and booking buttons above the fold.", "Simple forms.", "Fast page load on mobile networks."] },
      ],
      relatedLinks: related,
    },
  },
  "how-to-build-better-location-pages": {
    slug: "how-to-build-better-location-pages",
    metaTitle: "How to build better location pages for local SEO | GravyBlock",
    metaDescription: "Create location pages that improve local visibility, trust, and conversion without duplicate or thin content.",
    model: {
      eyebrow: "Question guide",
      title: "How to build better location pages",
      intro: "Great location pages answer local buyer questions clearly and uniquely.",
      meaningForBusiness: "Better location pages help you appear in local search while improving conversion from map and organic visits.",
      sections: [
        { title: "Include local specifics", body: "Address practical questions: service boundaries, parking, hours, and what people can expect." },
        { title: "Avoid thin duplicates", body: "Each page should include distinct context, proof, and examples from that location or area." },
        { title: "Tie pages to conversion", body: "Each location page needs clear next actions tied to that local audience." },
      ],
      relatedLinks: related,
    },
  },
  "local-seo-for-apartment-complexes": {
    slug: "local-seo-for-apartment-complexes",
    metaTitle: "Local SEO for apartment complexes | GravyBlock",
    metaDescription: "Improve apartment community visibility and leasing conversion with stronger profile trust and location-page clarity.",
    model: {
      eyebrow: "Use-case guide",
      title: "Local SEO for apartment complexes",
      intro: "Leasing teams compete on trust, clarity, and speed to tour booking.",
      meaningForBusiness: "Stronger profile and website alignment increases qualified tour traffic and reduces mismatched leads.",
      sections: [
        { title: "Leasing-intent profile optimization", body: "Use accurate amenities, office hours, and access details that match the actual leasing experience." },
        { title: "Website trust and conversion", body: "Tour paths, fee clarity, and policy transparency matter as much as photos." },
        { title: "AI visibility implications", body: "AI summaries favor communities with consistent amenity and location facts across channels." },
      ],
      relatedLinks: related,
    },
  },
  "local-seo-for-home-services": {
    slug: "local-seo-for-home-services",
    metaTitle: "Local SEO for home services companies | GravyBlock",
    metaDescription: "Home service businesses can improve local calls and bookings with profile, trust, and conversion readiness improvements.",
    model: {
      eyebrow: "Use-case guide",
      title: "Local SEO for home services",
      intro: "Home service demand is urgent and trust-sensitive. Visibility and conversion must work together.",
      meaningForBusiness: "When local signals are consistent and trust is obvious, more high-intent calls convert into booked jobs.",
      sections: [
        { title: "Profile foundations for service-area operators", body: "Keep categories, service areas, and schedule expectations accurate and current." },
        { title: "Website conversion priorities", body: "Phone-first UX, clear service pages, and trust proof outperform broad generic copy." },
        { title: "Reputation and AI readiness", body: "Consistent facts and quality reviews improve map conversion and AI citation quality." },
      ],
      relatedLinks: related,
    },
  },
  "local-seo-for-law-firms": {
    slug: "local-seo-for-law-firms",
    metaTitle: "Local SEO for law firms | GravyBlock",
    metaDescription: "Law firms can improve local intake quality with stronger profile credibility, website trust, and conversion clarity.",
    model: {
      eyebrow: "Use-case guide",
      title: "Local SEO for law firms",
      intro: "Legal clients compare credibility and responsiveness fast. Local trust determines who gets the first call.",
      meaningForBusiness: "Better local trust and intake UX improves both lead quantity and lead quality.",
      sections: [
        { title: "Profile and practice clarity", body: "Align profile categories and services with your actual practice strengths and local offices." },
        { title: "Trust and intake conversion", body: "Make contact routes clear and reduce uncertainty with plain-language credibility cues." },
        { title: "AI answer-engine impact", body: "Consistent legal service facts improve how assistants summarize and recommend firms." },
      ],
      relatedLinks: related,
    },
  },
  "local-seo-for-dentists": {
    slug: "local-seo-for-dentists",
    metaTitle: "Local SEO for dentists and dental practices | GravyBlock",
    metaDescription: "Dental practices can improve local patient acquisition through stronger profile trust and website conversion readiness.",
    model: {
      eyebrow: "Use-case guide",
      title: "Local SEO for dentists",
      intro: "Dental patients compare trust and convenience quickly. Local consistency drives booking confidence.",
      meaningForBusiness: "Tight profile and website alignment improves appointment conversion from local search and map traffic.",
      sections: [
        { title: "Profile and provider consistency", body: "Keep services, hours, and provider details aligned across profile and website." },
        { title: "Website trust and booking UX", body: "Use simple appointment pathways and clear treatment framing without heavy jargon." },
        { title: "Reviews and AI visibility", body: "Reviews and corroborated facts influence both human decisions and assistant summaries." },
      ],
      relatedLinks: related,
    },
  },
};

export const QUESTION_GUIDE_SLUGS = Object.keys(QUESTION_GUIDES);
