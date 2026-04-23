"use server";

import { redirect } from "next/navigation";
import { sendLeadEmails } from "@/lib/integrations/resend";
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
  const parsed = scanFormSchema.safeParse({
    query: field(formData, "query"),
    locationHint: field(formData, "locationHint"),
    placeId: field(formData, "placeId"),
    contactName: field(formData, "contactName"),
    contactEmail: field(formData, "contactEmail"),
    businessModel: field(formData, "businessModel"),
    vertical: field(formData, "vertical"),
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
      vertical: parsed.data.vertical,
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
      businessModel: parsed.data.businessModel,
      vertical: parsed.data.vertical,
      leadCapture: {
        name: parsed.data.contactName,
        email: parsed.data.contactEmail,
        source: "scan_form",
      },
    });
    void sendLeadEmails(
      {
        leadName: parsed.data.contactName,
        leadEmail: parsed.data.contactEmail,
        source: "scan_form",
        businessName: generated.profile.name,
      },
      true,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save report";
    return { status: "error", formError: message };
  }

  redirect(`/report/${publicId}`);
}
