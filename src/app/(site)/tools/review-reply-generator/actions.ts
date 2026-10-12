"use server";

import { openRouterChat } from "@/lib/integrations/openrouter";
import { allow, clientKey } from "@/lib/tools/rate-limit";

export type ReplyResult = { ok: true; reply: string } | { ok: false; error: string };

const TONES = { warm: "warm and friendly", professional: "professional and polite", brief: "short and to the point" } as const;

/**
 * One small model call per request: a few hundred input tokens and about 150 output tokens (well under a tenth of a cent
 * on gpt-4o-mini). Nothing is stored. Per-visitor and global daily caps keep the cost bounded.
 */
export async function generateReplyAction(input: { review: string; businessName?: string; tone?: string }): Promise<ReplyResult> {
  const review = (input.review ?? "").trim().slice(0, 1200);
  if (review.length < 10) return { ok: false, error: "Paste the review text first." };
  if (!allow("review-reply", await clientKey(), { perHour: 6, perDay: 500 })) {
    return { ok: false, error: "Too many replies generated right now. Please try again in a little while." };
  }
  const business = (input.businessName ?? "").trim().slice(0, 80);
  const tone = TONES[(input.tone as keyof typeof TONES) ?? "professional"] ?? TONES.professional;
  const text = await openRouterChat({
    model: "openai/gpt-4o-mini",
    maxTokens: 220,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "You write public replies from a local business owner to a customer review. Rules: under 90 words; " +
          `${tone}; thank the reviewer; for a negative review apologize sincerely, do not argue or blame, and invite them to contact the business directly; ` +
          "never invent facts, offers, refunds, names or details that are not in the review; do not promise anything specific; no hashtags or emojis; " +
          "sign with the business name only if one is provided. Output only the reply text.",
      },
      { role: "user", content: `${business ? `Business: ${business}\n` : ""}Review:\n${review}` },
    ],
  });
  if (!text) return { ok: false, error: "We could not write a reply right now. Please try again." };
  return { ok: true, reply: text.trim() };
}
