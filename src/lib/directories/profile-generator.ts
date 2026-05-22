import { randomUUID } from "node:crypto";
import { eq, and, gte } from "drizzle-orm";
import { getDb, businesses, businessConfigs, operatorTasks, jobs } from "@/lib/db";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";

type DirectoryProfile = {
  name: string;
  url: string;
  claimUrl: string;
  description: string;
  doFollowValue: "high" | "medium" | "low";
};

const FREE_DIRECTORIES: DirectoryProfile[] = [
  {
    name: "Bing Places for Business",
    url: "https://www.bingplaces.com",
    claimUrl: "https://www.bingplaces.com/BusinessOwner/GetStarted",
    description: "Microsoft's business directory — Bing drives ~6% of US searches and powers Cortana and ChatGPT search results.",
    doFollowValue: "high",
  },
  {
    name: "Apple Maps Connect",
    url: "https://mapsconnect.apple.com",
    claimUrl: "https://mapsconnect.apple.com",
    description: "All iPhone users use Apple Maps. A claimed listing puts you on Siri and Apple Maps results.",
    doFollowValue: "high",
  },
  {
    name: "Nextdoor Business",
    url: "https://business.nextdoor.com",
    claimUrl: "https://business.nextdoor.com/en-us/ads",
    description: "Hyperlocal neighborhood network. Free business page with local resident recommendations.",
    doFollowValue: "medium",
  },
  {
    name: "Yellow Pages (YP.com)",
    url: "https://www.yellowpages.com",
    claimUrl: "https://www.yellowpages.com/claim-business",
    description: "Legacy directory still crawled by Google. Claimed listings pass citation authority.",
    doFollowValue: "medium",
  },
  {
    name: "Manta",
    url: "https://www.manta.com",
    claimUrl: "https://www.manta.com/claim-business",
    description: "Small business directory with strong domain authority. Free listing with company description.",
    doFollowValue: "medium",
  },
  {
    name: "Foursquare",
    url: "https://foursquare.com",
    claimUrl: "https://business.foursquare.com/manage",
    description: "Powers location data for many apps including Snapchat, Uber, and mapping services.",
    doFollowValue: "high",
  },
  {
    name: "BBB (Better Business Bureau)",
    url: "https://www.bbb.org",
    claimUrl: "https://www.bbb.org/bbbdirectory/business-claim",
    description: "Accreditation is paid but a basic free listing is available. High trust signal for local searches.",
    doFollowValue: "high",
  },
  {
    name: "Alignable",
    url: "https://www.alignable.com",
    claimUrl: "https://www.alignable.com/register",
    description: "B2B small business network. Referrals between local businesses, local backlink opportunity.",
    doFollowValue: "medium",
  },
  {
    name: "Hotfrog",
    url: "https://www.hotfrog.com",
    claimUrl: "https://www.hotfrog.com/add-business",
    description: "Free business directory. DA 58, crawled regularly by Google for citation signals.",
    doFollowValue: "medium",
  },
  {
    name: "EZLocal",
    url: "https://www.ezlocal.com",
    claimUrl: "https://www.ezlocal.com/add-business",
    description: "Free local business listing with structured NAP data. Good citation source.",
    doFollowValue: "low",
  },
];

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your city";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

function stateFromAddress(address: string | null | undefined): string {
  if (!address) return "";
  const parts = address.split(",");
  if (parts.length >= 3) return parts[2].trim().split(/\s+/)[0] ?? "";
  return "";
}

async function generateProfileDescription(params: {
  businessName: string;
  industry: string;
  city: string;
  state: string;
  services: string;
  directoryName: string;
}): Promise<string | null> {
  return openRouterChat({
    model: MODELS.content,
    messages: [{
      role: "user",
      content: `Write a business directory profile description for ${params.businessName} to use on ${params.directoryName}.

Business: ${params.businessName}
Industry: ${params.industry}
Location: ${params.city}, ${params.state}
Services: ${params.services}

Requirements:
- 100-150 words
- Starts with the business name and what they do
- Mentions ${params.city} and the primary service naturally
- Includes 2-3 specific services
- Ends with a clear call to action
- No em dashes, no AI clichés
- Reads as professional and trustworthy

Write the description now.`,
    }],
    maxTokens: 250,
    temperature: 0.6,
  });
}

export async function runDirectoryProfileBatch(batchSize = 3): Promise<{ processed: number }> {
  const db = getDb();
  if (!db) return { processed: 0 };

  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const recentJobCheck = await db
    .select({ businessId: jobs.businessId })
    .from(jobs)
    .where(
      and(
        eq(jobs.type, "directory_profile_generator"),
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
      website: businesses.website,
      phone: businesses.phone,
      vertical: businesses.vertical,
      primaryCategory: businesses.primaryCategory,
      planTier: businesses.planTier,
    })
    .from(businesses)
    .limit(batchSize * 5);

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
      type: "directory_profile_generator",
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
      const state = stateFromAddress(biz.address);
      const services = config?.serviceDescription ?? `${biz.name} offers ${industry} services in ${city}.`;

      // Generate one shared description, then tailor per high-value directories
      const baseDescription = await generateProfileDescription({
        businessName: biz.name,
        industry,
        city,
        state,
        services,
        directoryName: "local business directories",
      });

      if (!baseDescription) {
        await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, jobId));
        continue;
      }

      // Build a single comprehensive task with all directories
      const highValueDirs = FREE_DIRECTORIES.filter((d) => d.doFollowValue === "high");
      const mediumDirs = FREE_DIRECTORIES.filter((d) => d.doFollowValue === "medium");

      const taskDetail = [
        `Use the profile description below on each directory. Copy your exact business name, address, phone number, and website from Google Business Profile to keep your NAP (Name, Address, Phone) consistent across the web.`,
        "",
        `PROFILE DESCRIPTION TO USE:`,
        baseDescription,
        "",
        `BUSINESS INFO FOR ALL LISTINGS:`,
        `Name: ${biz.name}`,
        `Address: ${biz.address ?? city + ", " + state}`,
        `Phone: ${biz.phone ?? "(add your phone number)"}`,
        `Website: ${biz.website ?? "(add your website URL)"}`,
        "",
        `HIGH-PRIORITY DIRECTORIES (biggest SEO impact):`,
        ...highValueDirs.map((d) => `- ${d.name}: ${d.claimUrl}\n  Why: ${d.description}`),
        "",
        `ALSO WORTH ADDING (good citation sources):`,
        ...mediumDirs.map((d) => `- ${d.name}: ${d.claimUrl}`),
      ].join("\n");

      await db.insert(operatorTasks).values({
        id: randomUUID(),
        businessId: biz.id,
        title: `Claim your free listings on ${highValueDirs.length + mediumDirs.length} directories for more backlinks`,
        detail: taskDetail,
        queue: "citation_ops",
        status: "queued",
      });

      await db.update(jobs).set({ status: "completed" }).where(eq(jobs.id, jobId));
      processed += 1;
    } catch (error) {
      await db.update(jobs).set({ status: "failed" }).where(eq(jobs.id, jobId));
      console.error("[directory-profiles] failed for business", {
        businessId: biz.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed };
}
