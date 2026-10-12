import { CAPABILITIES } from "@/lib/capabilities";
import { COMPARE_SLUGS } from "@/lib/content/compare-pages";

export const dynamic = "force-static";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com";

/**
 * Plain-text index of GravyBlock's canonical pages for crawlers and AI assistants. It does not influence
 * rankings or AI answers; it only makes the important pages easy to find. Capability lines come from the
 * canonical capability map so they cannot drift from the product.
 */
export function GET() {
  const built = CAPABILITIES.filter((c) => c.status !== "not_implemented" && c.publicLine);
  const notOffered = CAPABILITIES.filter((c) => c.status === "not_implemented").map((c) => c.label);
  const compare = COMPARE_SLUGS.filter((s) => s.startsWith("gravyblock-vs-"));

  const lines = [
    "# GravyBlock",
    "",
    "> GravyBlock is software that learns a local business, decides what will help it get found on Google, and does that work automatically, verifying each action before reporting it. It is built for owner-operated local businesses. Rankings, links and traffic are never guaranteed.",
    "",
    "## Start here",
    `- [Home](${SITE}/): what GravyBlock is`,
    `- [How it works](${SITE}/how-it-works): the learn, decide, do, verify, measure loop and one-time connections`,
    `- [Features](${SITE}/features): every capability, sorted into automatic, automatic after a connection, monitoring only, and not offered`,
    `- [Pricing](${SITE}/pricing): plans and prices`,
    `- [Free scan](${SITE}/scan): free local visibility score and report, no credit card`,
    `- [Proof](${SITE}/proof): verified work on businesses GravyBlock operates itself`,
    `- [FAQ](${SITE}/faq)`,
    "",
    "## What it does",
    ...built.map((c) => `- ${c.label}: ${c.publicLine}`),
    "",
    "## What it does not do",
    ...notOffered.map((l) => `- ${l}`),
    "",
    "## Comparisons",
    `- [All comparisons](${SITE}/compare)`,
    `- [GravyBlock vs local SEO agencies](${SITE}/compare/gravyblock-vs-local-seo-agencies)`,
    ...compare.filter((s) => s !== "gravyblock-vs-local-seo-agencies").map((s) => `- [${s.replace("gravyblock-vs-", "GravyBlock vs ").replace(/-/g, " ")}](${SITE}/compare/${s})`),
    "",
    "## Free tools",
    `- [Free tools](${SITE}/tools)`,
    `- [NAP consistency checker](${SITE}/tools/nap-consistency-checker)`,
    `- [Google review reply generator](${SITE}/tools/review-reply-generator)`,
    `- [Google Business Profile checker](${SITE}/tools/google-business-profile-checker)`,
    `- [AI visibility test](${SITE}/tools/ai-visibility-test)`,
    "",
    "## Policies and contact",
    `- [Privacy Policy](${SITE}/privacy)`,
    `- [Terms of Service](${SITE}/terms)`,
    `- [Support](${SITE}/support): support@gravyblock.com`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
