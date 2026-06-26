"use server";

import { getDb, testimonials } from "@/lib/db";

export type FeedbackResult = { ok: boolean; error?: string };

export async function submitTestimonial(
  _prev: FeedbackResult | null,
  formData: FormData,
): Promise<FeedbackResult> {
  const authorName = (formData.get("authorName") as string | null)?.trim();
  const businessName = (formData.get("businessName") as string | null)?.trim() || null;
  const role = (formData.get("role") as string | null)?.trim() || null;
  const city = (formData.get("city") as string | null)?.trim() || null;
  const quote = (formData.get("quote") as string | null)?.trim();
  const ratingRaw = formData.get("rating") as string | null;
  const businessId = (formData.get("businessId") as string | null)?.trim() || null;

  if (!authorName) return { ok: false, error: "Please enter your name." };
  if (!quote || quote.length < 10) return { ok: false, error: "Please share a sentence or two about your experience." };

  const rating = ratingRaw ? Math.max(1, Math.min(5, parseInt(ratingRaw, 10))) : null;

  const db = getDb();
  if (!db) return { ok: true }; // accept gracefully if DB unavailable

  try {
    await db.insert(testimonials).values({
      authorName,
      businessName,
      role,
      city,
      quote,
      rating,
      status: "pending", // Chris approves before it shows publicly
      ...(businessId ? { businessId } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.error("[feedback] submit failed", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
