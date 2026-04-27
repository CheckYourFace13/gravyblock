"use server";

import { saveSetupConfig } from "@/lib/setup/tokens";

export type SetupActionState =
  | { status: "idle" }
  | { status: "success"; businessName: string }
  | { status: "error"; message: string };

export async function submitSetupAction(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const token = String(formData.get("token") ?? "");
  if (!token) return { status: "error", message: "Invalid setup link." };

  const ok = await saveSetupConfig(token, {
    targetKeywords: String(formData.get("targetKeywords") ?? ""),
    targetCities: String(formData.get("targetCities") ?? ""),
    serviceDescription: String(formData.get("serviceDescription") ?? ""),
    uniqueSellingPoints: String(formData.get("uniqueSellingPoints") ?? ""),
    tone: String(formData.get("tone") ?? "professional"),
    competitorNames: String(formData.get("competitorNames") ?? ""),
    instagramHandle: String(formData.get("instagramHandle") ?? ""),
    facebookUrl: String(formData.get("facebookUrl") ?? ""),
    tiktokHandle: String(formData.get("tiktokHandle") ?? ""),
    additionalContext: String(formData.get("additionalContext") ?? ""),
  });

  if (!ok) return { status: "error", message: "This setup link has expired or already been used." };

  const businessName = String(formData.get("businessName") ?? "your business");
  return { status: "success", businessName };
}
