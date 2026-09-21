import { randomUUID } from "node:crypto";
import { eq, and, gte } from "drizzle-orm";
import { getDb, businesses, businessConfigs, operatorTasks, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { postGbpQuestion, isGbpConnected } from "@/lib/integrations/gbp-write";

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your city";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

async function generateQandA(params: {
  businessName: string;
  industry: string;
  city: string;
  services: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Generate 10 Google Business Profile Q&As for a local ${params.industry} business.

Business: ${params.businessName}
City: ${params.city}
Services: ${params.services}

Format each Q&A as:
Q: [specific customer question]
A: [helpful, specific answer mentioning ${params.city} where natural]

Rules:
- Questions should be real things customers search or ask
- Answers should be 2-4 sentences, factual and helpful
- Mix: hours/availability, services offered, pricing expectations, how it works, why choose them, service area
- No generic filler
- No em dashes, no AI clichés

Write all 10 Q&As now.`,
    }],
    maxTokens: 800,
    temperature: 0.6,
  });
}

async function generateServicesBlock(params: {
  businessName: string;
  industry: string;
  city: string;
  services: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Generate a complete Google Business Profile services list for a local ${params.industry} business.

Business: ${params.businessName}
City: ${params.city}
Existing services description: ${params.services}

Format:
SERVICE NAME | Brief description (1 sentence, specific and clear)

Create 8-12 services. Use real service names customers search for. Be specific to ${params.industry}.
No generic entries like "Consultation" without context.

Write the full services list now.`,
    }],
    maxTokens: 500,
    temperature: 0.6,
  });
}

/**
 * Retired. The previous version asked a model to invent ten Q&As (hours,
 * pricing expectations, service area) with no facts supplied, posted the
 * questions to the listing, and handed the owner a services list to paste in
 * by hand. Invented business facts and recurring owner labor are both out.
 * A fact-grounded replacement is only worth building once Google's profile
 * APIs allow no-touch edits; until then nothing is generated or assigned.
 */
export async function runGbpQaOptimizerBatch(_batchSize = 3): Promise<{ processed: number }> {
  return { processed: 0 };
}
