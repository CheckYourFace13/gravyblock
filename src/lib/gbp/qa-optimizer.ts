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

export async function runGbpQaOptimizerBatch(batchSize = 3): Promise<{ processed: number }> {
  const db = getDb();
  if (!db) return { processed: 0 };

  // Find businesses that haven't had GBP Q&A tasks generated this month
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentJobCheck = await db
    .select({ businessId: jobs.businessId })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "gbp_qa_optimizer"),
        eq(jobs.status, "completed"),
        gte(jobs.createdAt, oneMonthAgo),
      ),
    )
    .limit(200);

  const alreadyDone = new Set(recentJobCheck.map((r) => r.businessId).filter(Boolean));

  const bizList = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      address: businesses.address,
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .limit(batchSize * 5);

  // Filter to paid plans only
  const eligible = bizList.filter((b) => {
    if (alreadyDone.has(b.id)) return false;
    const tier = b.planTier ?? "free";
    return tier !== "free";
  }).slice(0, batchSize);

  let processed = 0;

  for (const biz of eligible) {
    const jobId = randomUUID();
    await db.insert(jobs).values({
      id: jobId,
      businessId: biz.id,
      type: "gbp_qa_optimizer",
      payload: { source: "worker" },
      status: "running",
    });

    try {
      const [config] = await db
        .select({ serviceDescription: businessConfigs.serviceDescription })
        .from(businessConfigs)
        .where(eq(businessConfigs.businessId, biz.id))
        .limit(1);

      const industry = biz.vertical ?? biz.primaryCategory ?? "local business";
      const city = cityFromAddress(biz.address);
      const services = config?.serviceDescription ?? `${biz.name} offers ${industry} services in ${city}.`;

      const [qaContent, servicesContent] = await Promise.all([
        generateQandA({ businessName: biz.name, industry, city, services }),
        generateServicesBlock({ businessName: biz.name, industry, city, services }),
      ]);

      const tasks = [];

      if (qaContent) {
        // Auto-post Q&As if Google is connected; otherwise create a manual task
        const gbpConnected = await isGbpConnected(biz.id);
        if (gbpConnected) {
          // Parse Q&A lines and post each question automatically
          const qaLines = qaContent.split("\n");
          let autoPosted = 0;
          for (const line of qaLines) {
            const match = line.match(/^Q:\s*(.+)$/);
            if (match?.[1]) {
              const result = await postGbpQuestion(biz.id, match[1].trim());
              if (result.ok) autoPosted++;
              await new Promise((r) => setTimeout(r, 500)); // small delay between posts
            }
          }
          if (autoPosted > 0) {
            console.info("[gbp-qa] auto-posted Q&As", { businessId: biz.id, count: autoPosted });
          }
        } else {
          tasks.push({
            id: randomUUID(),
            businessId: biz.id,
            title: "Add these Q&As to your Google Business Profile",
            detail: `Log in to your Google Business Profile at business.google.com, go to the Q&A section, and post these questions and answers. This helps customers find you for specific searches.\n\n${qaContent}`,
            queue: "gbp_ops",
            status: "queued",
          });
        }
      }

      if (servicesContent) {
        tasks.push({
          id: randomUUID(),
          businessId: biz.id,
          title: "Update your Google Business Profile services list",
          detail: `Log in to your Google Business Profile at business.google.com, click Edit Profile, then Services. Add or update these service entries:\n\n${servicesContent}`,
          queue: "gbp_ops",
          status: "queued",
        });
      }

      if (tasks.length > 0) {
        await db.insert(operatorTasks).values(tasks);
      }

      await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, jobId));
      processed += 1;
    } catch (error) {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, jobId));
      console.error("[gbp-qa] failed for business", {
        businessId: biz.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed };
}
