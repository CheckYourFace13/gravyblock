"use server";

import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { generateTopicClusterMap, type TopicCluster } from "@/lib/content/topic-clusters";

export async function fetchTopicClusters(businessId: string): Promise<{
  ok: boolean;
  clusters?: TopicCluster[];
  error?: string;
}> {
  await requireBusinessAccess(businessId);
  try {
    const clusters = await generateTopicClusterMap(businessId);
    return { ok: true, clusters };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Generation failed" };
  }
}
