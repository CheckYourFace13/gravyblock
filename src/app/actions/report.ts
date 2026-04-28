"use server";

import { redirect } from "next/navigation";
import { createPublicId, generateReportFromPlace, generateReportFromWebsite } from "@/lib/report/generator";
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
    planIntentRaw === "agency" ? "agency"
    : planIntentRaw === "pro" ? "pro"
    : planIntentRaw === "growth" ? "growth"
    : planIntentRaw === "starter" || planIntentRaw === "base" || planIntentRaw === "entry" ? "starter"
    : null;
  const promoCodeIntentRaw = field(formData, "promoCodeIntent");
  const promoCodeIntent =
    promoCodeIntentRaw === "ILoveYouFree" || promoCodeIntentRaw === "ILikeYou50" ? promoCodeIntentRaw : null;

  const scanMode = field(formData, "scanMode") || "places";

  const rawInput = scanMode === "website"
    ? {
        scanMode: "website" as const,
        websiteUrl: field(formData, "websiteUrl"),
        businessName: field(formData, "businessName"),
        focusArea: (field(formData, "focusArea") || "online") as "local" | "regional" | "national" | "online",
        targetScope: field(formData, "targetScope") || undefined,
      }
    : {
        scanMode: "places" as const,
        query: field(formData, "query"),
        locationHint: field(formData, "locationHint"),
        placeId: field(formData, "placeId"),
        candidateConfidence: field(formData, "candidateConfidence"),
        focusArea: (field(formData, "focusArea") || "local") as "local" | "regional" | "national" | "online",
        targetScope: field(formData, "targetScope") || undefined,
      };

  const parsed = scanFormSchema.safeParse(rawInput);

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  let generated;
  try {
    if (parsed.data.scanMode === "website") {
      generated = await generateReportFromWebsite({
        websiteUrl: parsed.data.websiteUrl,
        businessName: parsed.data.businessName,
        focusArea: parsed.data.focusArea,
        targetScope: parsed.data.targetScope,
        vertical: parsed.data.focusArea === "online" ? "online_brand" : "other",
      });
    } else {
      generated = await generateReportFromPlace({
        placeId: parsed.data.placeId,
        vertical: "other",
        query: parsed.data.query,
        locationHint: parsed.data.locationHint,
        candidateConfidence: parsed.data.candidateConfidence,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not generate report";
    return { status: "error", formError: message };
  }

  const publicId = createPublicId();
  try {
    if (parsed.data.scanMode === "website") {
      await recordScanRun({
        publicId,
        query: parsed.data.businessName,
        locationHint: parsed.data.targetScope ?? parsed.data.focusArea,
        selectedPlaceId: undefined,
        candidateConfidence: undefined,
        profile: generated.profile,
        payload: generated.payload,
        rankingChecks: generated.rankings,
        auditFindings: generated.crawlFindings,
        competitorSnapshots: generated.competitorSnapshots,
        businessModel: "single_location",
        vertical: parsed.data.focusArea === "online" ? "online_brand" : "other",
        focusArea: parsed.data.focusArea,
        targetScope: parsed.data.targetScope,
        websiteUrl: parsed.data.websiteUrl,
      });
    } else {
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
        focusArea: parsed.data.focusArea,
        targetScope: parsed.data.targetScope,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save report";
    return { status: "error", formError: message };
  }

  const next = new URL(`/report/${publicId}`, "http://localhost");
  if (selectedPlan) next.searchParams.set("plan", selectedPlan);
  if (promoCodeIntent) next.searchParams.set("promo", promoCodeIntent);
  const nextUrl = `${next.pathname}${next.search}`;
  redirect(nextUrl);
}
