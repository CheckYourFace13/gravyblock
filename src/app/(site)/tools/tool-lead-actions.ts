"use server";

/**
 * Lead capture for free tools (review link generator, ROI calculator).
 * Records the business owner as a lead — they enter the nurture drip
 * like any scan lead. Free tools are top-of-funnel acquisition.
 */

import { getDb, leads } from "@/lib/db";

export type ToolLeadResult = { ok: boolean; error?: string };

export async function captureToolLead(
  _prev: ToolLeadResult | null,
  formData: FormData,
): Promise<ToolLeadResult> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const businessName = (formData.get("businessName") as string | null)?.trim() || "Tool user";
  const toolName = (formData.get("toolName") as string | null)?.trim() || "free_tool";
  const placeId = (formData.get("placeId") as string | null)?.trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const db = getDb();
  if (!db) return { ok: true }; // accept silently if no DB

  try {
    await db.insert(leads).values({
      name: businessName,
      email,
      emailNormalized: email,
      source: "contact_form",
      message: `Free tool: ${toolName}`,
      ...(placeId ? { placeId } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.error("[tool-lead] capture failed", { error: err instanceof Error ? err.message : String(err) });
    return { ok: true }; // never block the tool experience on lead errors
  }
}
