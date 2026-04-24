"use server";

import { redirect } from "next/navigation";
import { createPublicId, generateReportFromPlace } from "@/lib/report/generator";
import { recordScanRun } from "@/lib/report/repository";
import { scanFormSchema } from "@/lib/validation/scan";

export type ReportActionState =
  | { status: "idle" }
  | {
      status: "error";
      formError?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value == null) return "";
  return typeof value === "string" ? value : value.toString();
}

export async function generateReportAction(
  _prev: ReportActionState,
  formData: FormData,
): Promise<ReportActionState> {
  const planIntentRaw = field(formData, "planIntent").toLowerCase();
  const selectedPlan =
    planIntentRaw === "pro" ? "pro" : planIntentRaw === "base" || planIntentRaw === "entry" ? "base" : null;

  const parsed = scanFormSchema.safeParse({
    query: field(formData, "query"),
    locationHint: field(formData, "locationHint"),
    placeId: field(formData, "placeId"),
    candidateConfidence: field(formData, "candidateConfidence"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let generated;
  try {
    generated = await generateReportFromPlace({
      placeId: parsed.data.placeId,
      vertical: "other",
      query: parsed.data.query,
      locationHint: parsed.data.locationHint,
      candidateConfidence: parsed.data.candidateConfidence,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate report";
    return { status: "error", formError: message };
  }

  const publicId = createPublicId();
  try {
    await recordScanRun({
      publicId,
      query: parsed.data.query,
      locationHint: parsed.data.locationHint,
      selectedPlaceId: parsed.data.placeId,
      candidateConfidence: parsed.data.candidateConfidence,
      profile: generated.profile,
      payload: generated.payload,
      rankingChecks: generated.rankings,
      auditFindings: generated.crawlFindings,
      competitorSnapshots: generated.competitorSnapshots,
      businessModel: "single_location",
      vertical: "other",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save report";
    return { status: "error", formError: message };
  }

  const nextUrl = selectedPlan ? `/report/${publicId}?plan=${selectedPlan}` : `/report/${publicId}`;
  redirect(nextUrl);
}
