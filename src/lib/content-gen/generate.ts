import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { containsPlaceholderArtifact } from "./quality-guard";

export type ContentType =
  | "article"
  | "gbp_post"
  | "reddit_post"
  | "instagram_caption"
  | "facebook_post"
  | "video_script"
  | "email_newsletter"
  | "press_release";

export type GeneratedContent = {
  type: ContentType;
  title: string;
  body: string;
  targetKeyword: string;
};

export type CrossLinkPartner = {
  name: string;
  industry: string;
  url: string | null;
};

export type FocusArea = "local" | "regional" | "national" | "online" | "global";

export type GenerateLocalContentParams = {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  keywords: string[];
  tone: string;
  serviceDescription: string;
  /** Concrete differentiators the owner gave at signup — use these instead of generic claims */
  uniqueSellingPoints?: string;
  crossLinkPartner?: CrossLinkPartner;
  focusArea?: FocusArea;
  /** Human-readable scope: city name, state, country, or "worldwide" */
  targetScope?: string;
};

/** Returns how to reference the target audience/geography in prompts. */
function scopePhrase(params: GenerateLocalContentParams): string {
  if (params.targetScope) return params.targetScope;
  if (params.focusArea === "global") return "a worldwide audience";
  if (params.focusArea === "national") return "customers across the country";
  if (params.focusArea === "online") return "their online audience";
  if (params.focusArea === "regional") return params.state || params.city;
  return params.city;
}

/** Line to splice into a prompt when the owner gave concrete differentiators at signup. */
function uspLine(params: GenerateLocalContentParams): string {
  return params.uniqueSellingPoints
    ? `\nWhat makes them different (use these specifics, don't invent your own): ${params.uniqueSellingPoints}`
    : "";
}

/** Returns a location label appropriate for the focus area. */
function locationLabel(params: GenerateLocalContentParams): string {
  if (params.focusArea === "global") return "worldwide";
  if (params.focusArea === "national") return "nationwide";
  if (params.focusArea === "online") return "online";
  if (params.focusArea === "regional") return params.state || params.city;
  return params.city;
}

const STYLE_RULES = `Writing rules:
- No em dashes. Use commas or periods instead.
- No AI clichés: do not use "delve", "leverage", "comprehensive", "robust", "moreover", "furthermore", "tapestry", "nuanced", "landscape".
- Write like a knowledgeable local, specific and direct.
- Do not pad with filler phrases or generic openers like "In today's world" or "In conclusion".
- Use the location/scope naturally, not repetitively.`;

async function generateArticle(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const scope = scopePhrase(params);
  const loc = locationLabel(params);
  const isLocal = !params.focusArea || params.focusArea === "local";
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${isLocal ? `in ${params.city}` : loc}`;
  const year = new Date().getFullYear();
  const title = isLocal
    ? `Best ${params.industry} in ${params.city}: What to Look for in ${year}`
    : `Best ${params.industry} ${loc === "online" ? "Online" : `in ${loc}`}: What to Look for in ${year}`;

  const crossLinkInstruction = params.crossLinkPartner
    ? `\nCross-link: In one of the H2 sections, naturally mention ${params.crossLinkPartner.name} (a ${params.crossLinkPartner.industry} in ${params.city}) as a complementary resource — not a competitor.${params.crossLinkPartner.url ? ` Link it as: [${params.crossLinkPartner.name}](${params.crossLinkPartner.url})` : ""}`
    : "";

  const audienceContext = isLocal
    ? `a business in ${params.city}, ${params.state}`
    : `a business serving ${scope}`;

  const prompt = `Write an SEO article for ${audienceContext}.

Business: ${params.businessName}
Industry: ${params.industry}
Target audience: ${scope}
Target keywords: ${params.keywords.join(", ")}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

Article title: ${title}
Target keyword: ${primaryKeyword}

${STYLE_RULES}

Structure:
- One H1 (the title)
- 2-3 H2 sections with practical advice for the target audience
- 600-900 words total
- End with a soft, specific mention of ${params.businessName} as an example${isLocal ? ` in ${params.city}` : ""}${crossLinkInstruction}

Write the full article in markdown now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1200,
    temperature: 0.7,
  });

  if (!body) return null;

  return {
    type: "article",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

async function generateGbpPost(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  // GBP posts only apply to businesses with a physical/local presence
  if (params.focusArea === "online" || params.focusArea === "global") return null;
  const loc = locationLabel(params);
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${loc}`;
  const title = `${params.businessName} — ${loc} Update`;

  const prompt = `Write a Google Business Profile post for a local business.

Business: ${params.businessName}
Industry: ${params.industry}
Location: ${loc}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

${STYLE_RULES}

Requirements:
- 150-200 words
- Short, punchy paragraphs
- Mention one specific service or seasonal angle
- Include a clear call-to-action at the end referencing ${loc}
- No markdown headers, just plain paragraphs

Write the post now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 400,
    temperature: 0.7,
  });

  if (!body) return null;

  return {
    type: "gbp_post",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

async function generateRedditPost(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const scope = scopePhrase(params);
  const isLocal = !params.focusArea || params.focusArea === "local";
  const subreddit = isLocal
    ? `r/${params.city.toLowerCase().replace(/\s+/g, "")} or r/${params.industry.toLowerCase().replace(/\s+/g, "")}`
    : `r/${params.industry.toLowerCase().replace(/\s+/g, "")}`;
  const primaryKeyword = params.keywords[1] ?? params.keywords[0] ?? `${params.industry} ${scope}`;
  const title = isLocal
    ? `Looking for a good ${params.industry} in ${params.city} — here's what helped me`
    : `Looking for a good ${params.industry} — here's what actually matters`;

  const prompt = `Write a helpful Reddit-style community post for ${subreddit}.

Business to mention naturally: ${params.businessName}
Industry: ${params.industry}
Audience: ${scope}
Services: ${params.serviceDescription}${uspLine(params)}

${STYLE_RULES}

Requirements:
- 200-300 words
- First-person, conversational, community-helpful tone
- Answer the implicit question: "What should I look for in a ${params.industry}?"
- Give 3-4 genuine practical tips based on the service description and differentiators above
- Mention ${params.businessName} once near the end as a place the poster has used, naturally
- No hard sell, no marketing language
- Plain paragraphs, no markdown headers

Write the post now.`;

  const body = await openRouterChat({
    model: MODELS.content,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 500,
    temperature: 0.75,
  });

  if (!body) return null;

  return {
    type: "reddit_post",
    title,
    body,
    targetKeyword: primaryKeyword,
  };
}

async function generateInstagramCaption(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const prompt = `Write an Instagram caption for a local ${params.industry} business in ${params.city}.

Business: ${params.businessName}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

${STYLE_RULES}

Requirements:
- 80-120 words
- Conversational and human
- 1 clear hook in the first line (no "Hey there!" openers)
- Brief mention of a specific service or result
- Soft CTA mentioning ${params.city} (e.g., "Call us in ${params.city}" or "Book in ${params.city}")
- End with 8-12 relevant hashtags on a new line (mix local + industry)
- No markdown, no headers

Write the caption now.`;

  const body = await openRouterChat({ model: MODELS.content, messages: [{ role: "user", content: prompt }], maxTokens: 300, temperature: 0.8 });
  if (!body) return null;
  return { type: "instagram_caption", title: `Instagram: ${params.businessName}`, body, targetKeyword: primaryKeyword };
}

async function generateFacebookPost(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const prompt = `Write a Facebook business page post for a local ${params.industry} in ${params.city}.

Business: ${params.businessName}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

${STYLE_RULES}

Requirements:
- 120-200 words
- Friendly and community-focused
- Address a common local concern or question about ${params.industry}
- Mention ${params.city} naturally once
- End with a question to encourage comments OR a phone/booking CTA
- No markdown headers, plain paragraphs

Write the post now.`;

  const body = await openRouterChat({ model: MODELS.content, messages: [{ role: "user", content: prompt }], maxTokens: 350, temperature: 0.75 });
  if (!body) return null;
  return { type: "facebook_post", title: `Facebook: ${params.businessName}`, body, targetKeyword: primaryKeyword };
}

async function generateVideoScript(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const title = `${params.businessName} — ${params.city} ${params.industry} (60-second video)`;
  const prompt = `Write a 60-second video script for a local ${params.industry} in ${params.city}.

Business: ${params.businessName}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

${STYLE_RULES}

Format:
[HOOK - 0:00-0:05]: One punchy opening sentence spoken to camera
[PROBLEM - 0:05-0:15]: The pain point customers feel
[SOLUTION - 0:15-0:40]: How ${params.businessName} solves it (2-3 specific points)
[SOCIAL PROOF - 0:40-0:50]: One result or customer outcome (realistic, not fake)
[CTA - 0:50-1:00]: Direct call to action mentioning ${params.city}

Keep each section tight. Write spoken words only — no [music] or [B-roll] directions. Max 150 words total.

Write the script now.`;

  const body = await openRouterChat({ model: MODELS.content, messages: [{ role: "user", content: prompt }], maxTokens: 400, temperature: 0.7 });
  if (!body) return null;
  return { type: "video_script", title, body, targetKeyword: primaryKeyword };
}

async function generateEmailNewsletter(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const title = `${params.businessName} — Monthly update for ${params.city} customers`;
  const prompt = `Write a monthly email newsletter from a local ${params.industry} business to their customer list.

Business: ${params.businessName}
City: ${params.city}, ${params.state}
Services: ${params.serviceDescription}${uspLine(params)}
Tone: ${params.tone}

${STYLE_RULES}

Requirements:
- Subject line suggestion at the top
- 250-350 words in the email body
- Personal greeting (Dear [First Name],)
- 1 useful tip or seasonal advice related to ${params.industry}
- Brief mention of a specific service or promotion
- A soft ask: leave a review, refer a friend, or book again
- Sign-off from the business owner
- No markdown headers in the email body (use plain paragraphs)

Write the full email now.`;

  const body = await openRouterChat({ model: MODELS.content, messages: [{ role: "user", content: prompt }], maxTokens: 600, temperature: 0.7 });
  if (!body) return null;
  return { type: "email_newsletter", title, body, targetKeyword: primaryKeyword };
}

async function generatePressRelease(params: GenerateLocalContentParams): Promise<GeneratedContent | null> {
  const primaryKeyword = params.keywords[0] ?? `${params.industry} ${params.city}`;
  const title = `${params.businessName} Continues to Serve ${params.city} ${params.industry} Customers`;
  const prompt = `Write a press release for a local ${params.industry} business.

Business: ${params.businessName}
City: ${params.city}, ${params.state}
Services: ${params.serviceDescription}${uspLine(params)}

${STYLE_RULES}

AP Style press release format:
FOR IMMEDIATE RELEASE

[Headline]

${params.city}, ${params.state} — [Lead paragraph: who, what, where, when, why in 1-2 sentences]

[Body: 2 paragraphs — what makes this business notable for the local community, a specific service or milestone]

[Quote: A quote from the business owner about serving the local community]

[Boilerplate: 2-sentence company description]

Contact: ${params.businessName} | ${params.city}, ${params.state}

Keep it factual, newsworthy, and under 350 words. This will be submitted to local news sites and free PR directories.

Write the press release now.`;

  const body = await openRouterChat({ model: MODELS.content, messages: [{ role: "user", content: prompt }], maxTokens: 600, temperature: 0.6 });
  if (!body) return null;
  return { type: "press_release", title, body, targetKeyword: primaryKeyword };
}

export async function generateLocalContent(
  params: GenerateLocalContentParams,
  types?: ContentType[],
): Promise<GeneratedContent[]> {
  const generatorMap: Record<ContentType, (p: GenerateLocalContentParams) => Promise<GeneratedContent | null>> = {
    article: generateArticle,
    gbp_post: generateGbpPost,
    reddit_post: generateRedditPost,
    instagram_caption: generateInstagramCaption,
    facebook_post: generateFacebookPost,
    video_script: generateVideoScript,
    email_newsletter: generateEmailNewsletter,
    press_release: generatePressRelease,
  };

  const requested = types ?? ["article", "gbp_post"];
  const results = await Promise.allSettled(requested.map((t) => generatorMap[t](params)));

  const generated: GeneratedContent[] = [];

  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      if (containsPlaceholderArtifact(result.value.body) || containsPlaceholderArtifact(result.value.title)) {
        console.warn("[content-gen] discarded output with unfilled placeholder", {
          type: result.value.type,
          businessName: params.businessName,
        });
        continue;
      }
      generated.push(result.value);
    } else if (result.status === "rejected") {
      console.error("[content-gen] generation failed for one content type", {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  }

  return generated;
}

// reddit_post is intentionally absent everywhere below: Reddit credentials
// aren't configured in production and the claim was pulled from the site, so
// generating reddit_post items would burn LLM spend on content with no
// consumer. The generator stays in the map above — re-add "reddit_post" to
// these lists (and restore the site copy) when Reddit is re-enabled.
export const ALL_CONTENT_TYPES: ContentType[] = [
  "article",
  "gbp_post",
  "instagram_caption",
  "facebook_post",
  "video_script",
  "email_newsletter",
  "press_release",
];

export const CONTENT_TYPES_BY_PLAN: Record<string, ContentType[]> = {
  free: ["article", "gbp_post"],
  starter: ["article", "gbp_post"],
  growth: ["article", "gbp_post", "instagram_caption", "facebook_post"],
  pro: ALL_CONTENT_TYPES,
  agency: ALL_CONTENT_TYPES,
};
