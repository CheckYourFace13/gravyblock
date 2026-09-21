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

/**
 * Retired. This used to create one owner to-do per month ('Claim your free
 * listings on N directories') listing directories that all require the
 * owner's own login/verification. Those targets are now tracked honestly by
 * the citation engine (src/lib/citations) as unsupported for no-touch
 * automation, without assigning recurring work to the customer.
 */
export async function runDirectoryProfileBatch(_batchSize = 3): Promise<{ processed: number }> {
  return { processed: 0 };
}
