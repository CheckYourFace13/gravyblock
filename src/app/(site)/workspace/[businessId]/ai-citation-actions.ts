"use server";

import { canAccessBusiness } from "@/lib/auth/customer-auth";
import { isAdminSession } from "@/lib/auth/admin-session";
import { runLlmProbesForBusiness } from "@/lib/ai-visibility/llm-probes";

export async function runCitationCheckAction(businessId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const authorized = (await isAdminSession()) || (await canAccessBusiness(businessId));
    if (!authorized) {
      return { ok: false, error: "Unauthorized business access" };
    }

    await runLlmProbesForBusiness(businessId);
    return { ok: true };
  } catch (error) {
    console.error("[ai-citation] runCitationCheckAction failed", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to run citation check",
    };
  }
}
