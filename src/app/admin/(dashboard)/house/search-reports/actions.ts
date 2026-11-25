"use server";

import { revalidatePath } from "next/cache";
import { isAdminSession } from "@/lib/auth/admin-session";
import { markCopied, markReportOpened, measureOutcomes, setRecommendationStatus, verifyCompleted } from "@/lib/search-intel/recommendations";
import { searchIntelEligible } from "@/lib/search-intel/gather";
import type { Status } from "@/lib/search-intel/recommendation-model";

const UUID = /^[0-9a-f-]{36}$/i;
const WEEK = /^\d{4}-\d{2}-\d{2}$/;

/** Every action here requires the authenticated admin session and works only on house accounts. */
async function guard(businessId: string): Promise<boolean> {
  return (await isAdminSession()) && UUID.test(businessId) && (await searchIntelEligible(businessId));
}

/** The owner opened a site report in admin: a view. New recommendations become Opened; nothing is marked as started. */
export async function recordReportOpened(businessId: string, weekEnding: string): Promise<void> {
  if (!WEEK.test(weekEnding) || !(await guard(businessId))) return;
  await markReportOpened(businessId, weekEnding);
}

/** The prompt was copied: flag the included recommendations as handed off. Workflow status is unchanged. */
export async function recordPromptCopied(businessId: string, ids: string[]): Promise<void> {
  if (!(await guard(businessId)) || !ids.every((i) => UUID.test(i))) return;
  await markCopied(businessId, ids);
  revalidatePath(`/admin/house/search-reports/${businessId}`);
}

export async function changeRecommendationStatus(businessId: string, recommendationId: string, to: Status): Promise<{ ok: boolean; reason?: string }> {
  if (!(await guard(businessId)) || !UUID.test(recommendationId)) return { ok: false, reason: "not allowed" };
  const r = await setRecommendationStatus(recommendationId, to);
  revalidatePath(`/admin/house/search-reports/${businessId}`);
  return r;
}

/** Re-check completed work now (read-only fetches of the live pages and Search Console) instead of waiting for the daily check. */
export async function verifyNow(businessId: string): Promise<{ checked: number; verified: number; measured: number }> {
  if (!(await guard(businessId))) return { checked: 0, verified: 0, measured: 0 };
  const v = await verifyCompleted(businessId);
  const m = await measureOutcomes(businessId);
  revalidatePath(`/admin/house/search-reports/${businessId}`);
  return { checked: v.checked, verified: v.verified, measured: m.measured };
}
