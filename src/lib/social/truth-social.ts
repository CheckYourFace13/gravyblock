/**
 * Plans Facebook/Instagram posts from VERIFIED company facts (Business Truth
 * layer) — newest things the company itself published first, then services it
 * lists. Only plans for businesses that already authorized a Facebook Page
 * (a one-time connection); the existing poster publishes queued items directly
 * with no per-post approval.
 */

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { businessConfigs, contentQueue, getDb, jobs } from "@/lib/db";
import { createHash } from "node:crypto";
import { ensureFreshTruth, promotableContent, currentOffers } from "@/lib/truth";
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

  // Event-driven: a NEW verified fact (offer/event/own-voice page) is promoted once per channel,
  // only while it is fresh (offers until they expire, pages for 60 days). Already-promoted facts
  // are tracked per fact and channel, so nothing is reposted and channels get different copy.
  const factId = (kind: string, value: string) => createHash("sha256").update(`${kind}|${norm(value)}`).digest("hex").slice(0, 24);
  const promoted = await db
    .select({ payload: jobs.payload })
    .from(jobs)
    .where(and(eq(jobs.businessId, businessId), eq(jobs.type, "fact_promotion")));
  const done = new Set(promoted.map((j) => `${(j.payload as { factId?: string }).factId}|${(j.payload as { channel?: string }).channel}`));

  type Seed = { label: string; url: string | null; kind: "offer" | "event" | "recent"; id: string };
  const seeds: Seed[] = [];
  for (const f of currentOffers(truth.facts)) seeds.push({ label: f.value, url: f.sourceUrl, kind: f.key === "event" ? "event" : "offer", id: factId(f.key, f.value) });
  for (const f of promotableContent(truth.facts)) seeds.push({ label: f.value, url: f.sourceUrl, kind: "recent", id: factId("recent_content", f.value) });

  const channelsWanted: { kind: "facebook_post" | "instagram_caption"; hint: string; key: string }[] = [];
  if (!haveFb) channelsWanted.push({ kind: "facebook_post", key: "facebook", hint: "a Facebook post (2-4 short sentences, friendly, may end with the link)" });
  if (!haveIg && cfg.ig) channelsWanted.push({ kind: "instagram_caption", key: "instagram", hint: "an Instagram caption (1-3 short sentences, 3-5 relevant hashtags, no link)" });

  const seed = seeds.find((sd) => channelsWanted.some((c) => !done.has(`${sd.id}|${c.key}`)));
  if (!seed) return { queued: 0, reason: "no_new_verified_fact_to_promote" };
  const channels = channelsWanted.filter((c) => !done.has(`${seed.id}|${c.key}`));

  // A new own-voice page is also a candidate asset for authority outreach.
  if (seed.kind === "recent" && seed.url) {
    await db.insert(jobs).values({ businessId, type: "authority_asset_candidate", status: "completed", payload: { url: seed.url, title: seed.label, factId: seed.id } });
  }

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
    await db.insert(jobs).values({ businessId, type: "fact_promotion", status: "queued", payload: { factId: seed.id, factKind: seed.kind, channel: ch.key, label: seed.label, url: seed.url, queuedAt: new Date().toISOString() } });
    queued++;
  }
  return { queued, reason: queued ? "planned" : "generation_failed" };
}
