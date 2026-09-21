/**
 * Plans Facebook/Instagram posts from VERIFIED company facts (Business Truth
 * layer) — newest things the company itself published first, then services it
 * lists. Only plans for businesses that already authorized a Facebook Page
 * (a one-time connection); the existing poster publishes queued items directly
 * with no per-post approval.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { businessConfigs, contentQueue, getDb } from "@/lib/db";
import { ensureFreshTruth } from "@/lib/truth";
import { openRouterChat, MODELS } from "@/lib/integrations/openrouter";
import { containsPlaceholderArtifact } from "@/lib/content-gen/quality-guard";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function planTruthGroundedSocial(businessId: string): Promise<{ queued: number; reason: string }> {
  const db = getDb();
  if (!db) return { queued: 0, reason: "no_db" };

  const [cfg] = await db
    .select({ pageId: businessConfigs.facebookPageId, token: businessConfigs.facebookAccessToken, ig: businessConfigs.instagramAccountId })
    .from(businessConfigs)
    .where(eq(businessConfigs.businessId, businessId))
    .limit(1);
  if (!cfg?.pageId || !cfg.token) return { queued: 0, reason: "social_not_connected" };

  // One planned post per channel per week.
  const weekAgo = new Date(Date.now() - 6 * 86_400_000);
  const recent = await db
    .select({ kind: contentQueue.kind, title: contentQueue.title })
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), inArray(contentQueue.kind, ["facebook_post", "instagram_caption"]), gte(contentQueue.createdAt, weekAgo)));
  const haveFb = recent.some((r) => r.kind === "facebook_post");
  const haveIg = recent.some((r) => r.kind === "instagram_caption");
  if (haveFb && (haveIg || !cfg.ig)) return { queued: 0, reason: "already_planned_this_week" };

  const truth = await ensureFreshTruth(businessId);
  if (!truth.sufficient) return { queued: 0, reason: `insufficient_truth:${truth.insufficientReason}` };

  const everUsed = await db
    .select({ title: contentQueue.title })
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), inArray(contentQueue.kind, ["facebook_post", "instagram_caption"])))
    .orderBy(desc(contentQueue.createdAt))
    .limit(200);
  const used = new Set(everUsed.map((r) => norm(r.title)));

  const seeds: { label: string; url: string | null; kind: "recent" | "service" }[] = [];
  const recentFacts = truth.facts
    .filter((f) => f.key === "recent_content")
    .sort((a, b) => (b.sourceUpdatedAt ?? b.fetchedAt).getTime() - (a.sourceUpdatedAt ?? a.fetchedAt).getTime());
  for (const f of recentFacts) seeds.push({ label: f.value, url: f.sourceUrl, kind: "recent" });
  for (const s of truth.services) seeds.push({ label: s, url: null, kind: "service" });
  const seed = seeds.find((s) => !used.has(norm(s.label)));
  if (!seed) return { queued: 0, reason: "no_unused_verified_topic" };

  const channels: { kind: "facebook_post" | "instagram_caption"; hint: string }[] = [];
  if (!haveFb) channels.push({ kind: "facebook_post", hint: "a Facebook post (2-4 short sentences, friendly, may end with the link)" });
  if (!haveIg && cfg.ig) channels.push({ kind: "instagram_caption", hint: "an Instagram caption (1-3 short sentences, 3-5 relevant hashtags, no link)" });

  let queued = 0;
  for (const ch of channels) {
    const text = await openRouterChat({
      model: MODELS.content,
      maxTokens: 300,
      temperature: 0.5,
      messages: [
        {
          role: "user",
          content: `${truth.promptBlock}\n\nWrite ${ch.hint} for ${truth.businessName}, about: "${seed.label}"${seed.url ? ` (their page: ${seed.url})` : ""}.\nUse only the verified facts above. No emojis spam, no invented offers, prices, dates, or claims. No placeholders. Return only the post text.`,
        },
      ],
    });
    const post = text?.trim();
    if (!post || post.length < 20 || containsPlaceholderArtifact(post)) continue;
    await db.insert(contentQueue).values({
      businessId,
      kind: ch.kind,
      title: seed.label,
      outline: seed.url && ch.kind === "facebook_post" && !post.includes(seed.url) ? `${post}\n\n${seed.url}` : post,
      targetKeyword: null,
      status: "queued",
      variant: "verified_truth",
    });
    queued++;
  }
  return { queued, reason: queued ? "planned" : "generation_failed" };
}
