"use server";

import { revalidatePath } from "next/cache";
import { sendLeadEmails } from "@/lib/integrations/resend";
import { saveLeadRecord } from "@/lib/report/repository";
import { leadFormSchema } from "@/lib/validation/lead";

export type LeadActionState =
  | { status: "idle" }
  | { status: "error"; fieldErrors?: Record<string, string[] | undefined>; formError?: string }
  | { status: "success" };

function field(formData: FormData, key: string) {
  const value = formData.get(key);
  if (value == null) return "";
  return typeof value === "string" ? value : value.toString();
}

export async function submitLeadAction(
  _prev: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const parsed = leadFormSchema.safeParse({
    name: field(formData, "name"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    message: field(formData, "message"),
    reportPublicId: field(formData, "reportPublicId"),
    organizationId: field(formData, "organizationId"),
    brandId: field(formData, "brandId"),
    locationId: field(formData, "locationId"),
    businessId: field(formData, "businessId"),
    vertical: field(formData, "vertical"),
    website: field(formData, "website"),
    placeId: field(formData, "placeId"),
    source: field(formData, "source"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const saved = await saveLeadRecord(parsed.data);
    void sendLeadEmails(
      {
        leadName: parsed.data.name,
        leadEmail: parsed.data.email,
        source: parsed.data.source,
        businessName: parsed.data.website ?? undefined,
        message: parsed.data.message,
      },
      saved?.created ?? true,
    );
    revalidatePath("/admin/leads");
    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save lead";
    return { status: "error", formError: message };
  }
}
