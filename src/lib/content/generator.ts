import Anthropic from "@anthropic-ai/sdk";

type GenerateParams = {
  businessName: string;
  city: string;
  vertical: string | null;
  title: string;
  outline: string;
  targetKeyword: string | null;
  changeSummary?: string;
  address?: string | null;
};

// Cached system prompt — keeps token cost low across repeated autopilot runs
const SYSTEM_PROMPT = `You are a local SEO content writer for GravyBlock, an automated local growth platform. You write clear, helpful, locally-relevant content for small businesses.

Rules:
- Write in plain, professional English. No jargon, no fluff, no filler phrases.
- Include the city name naturally 3-4 times throughout the piece.
- End every piece with a specific, local call-to-action (CTA) that names the city.
- Do not invent specific claims, awards, or statistics about the business.
- Do not use "In today's fast-paced world", "In conclusion", or similar openers.
- Format output as clean markdown with one H1, 2-3 H2s, and short paragraphs.
- Target length: 500-700 words for articles, 400-550 words for location pages.`;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

async function callClaude(client: Anthropic, userPrompt: string): Promise<string | null> {
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = message.content[0];
    if (block.type !== "text") return null;
    return block.text;
  } catch (error) {
    console.error("[content-generator] Claude API call failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function generateArticleBody(params: GenerateParams): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const prompt = `Write a local SEO article for this business:

Business name: ${params.businessName}
City: ${params.city}
Industry: ${params.vertical ?? "local business"}
Article title: ${params.title}
Target keyword: ${params.targetKeyword ?? "local services"}
Angle / outline: ${params.outline}${params.changeSummary ? `\nRecent context: ${params.changeSummary}` : ""}

Write the full article in markdown now.`;

  return callClaude(client, prompt);
}

export async function generateOutreachPitch(params: {
  businessName: string;
  city: string;
  targetName: string;
  targetUrl: string;
  referenceUrl: string;
  changeSummary: string;
}): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const prompt = `Write a short, professional outreach email pitch (3-4 sentences max) from a local business to a community website or directory.

Business: ${params.businessName} (${params.city})
Target site: ${params.targetName} (${params.targetUrl})
Reference content: ${params.referenceUrl}
Context: ${params.changeSummary}

The pitch should propose a relevant local resource contribution or listing. Do not be salesy. Be direct, local, and specific. Write only the pitch body — no subject line, no greeting, no sign-off.`;

  return callClaude(client, prompt);
}

export async function generateLocalPageBody(params: GenerateParams): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const prompt = `Write a service-area location page for this business:

Business name: ${params.businessName}
City: ${params.city}${params.address ? `\nAddress: ${params.address}` : ""}
Industry: ${params.vertical ?? "local business"}
Page title: ${params.title}
Angle / outline: ${params.outline}

Focus on local trust, service-area coverage, and neighborhood proof. Write the full page in markdown now.`;

  return callClaude(client, prompt);
}
