"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sendLeadEmails, sendReportDeliveryEmail } from "@/lib/integrations/resend";
import { getReportWithContext, saveLeadRecord } from "@/lib/report/repository";
import { createReportUnlockToken } from "@/lib/report/unlock-token";

const reportUnlockSchema = z.object({
  publicId: z.string().trim().min(6, "Report ID is required"),
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().trim().email("Valid email is required"),
});

export type ReportUnlockActionState =
  | { status: "idle" }
  | { status: "error"; fieldErrors?: Record<string, string[] | undefined>; formError?: string }
  | { status: "success"; unlockUrl: string };

const initialErrorState: ReportUnlockActionState = { status: "error", formError: "Could not unlock this report." };

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value == null) return "";
  return typeof value === "string" ? value : value.toString();
}

function fullSiteUrl(path: string) {
  const root = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function unlockReportAction(
  _prev: ReportUnlockActionState,
  formData: FormData,
): Promise<ReportUnlockActionState> {
  const parsed = reportUnlockSchema.safeParse({
    publicId: field(formData, "publicId"),
    name: field(formData, "name"),
    email: field(formData, "email"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const report = await getReportWithContext(parsed.data.publicId);
  if (!report) return initialErrorState;

  const unlockToken = createReportUnlockToken(parsed.data.publicId);
  const unlockPath = `/report/${parsed.data.publicId}?unlock=${encodeURIComponent(unlockToken)}`;
  const unlockUrl = fullSiteUrl(unlockPath);

  try {
    const saved = await saveLeadRecord({
      name: parsed.data.name,
      email: parsed.data.email,
      source: "report_form",
      reportPublicId: parsed.data.publicId,
      businessId: report.businessId ?? undefined,
      website: report.payload.business.website ?? undefined,
      placeId: report.payload.business.placeId ?? undefined,
    });
    void sendLeadEmails(
      {
        leadName: parsed.data.name,
        leadEmail: parsed.data.email,
        source: "report_form",
        businessName: report.payload.business.name,
      },
      saved?.created ?? true,
    );
    void sendReportDeliveryEmail({
      leadName: parsed.data.name,
      leadEmail: parsed.data.email,
      businessName: report.payload.business.name,
      score: report.payload.summary.score,
      verdict: report.payload.summary.verdict,
      topFindings: report.payload.prioritizedFixes.slice(0, 3).map((f) => f.title),
      unlockUrl,
    });
    revalidatePath("/admin/leads");
    return { status: "success", unlockUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not unlock this report";
    return { status: "error", formError: message };
  }
}

