"use server";

import { requireBusinessAccess } from "@/lib/auth/customer-guards";
import { disconnectGoogle } from "@/lib/integrations/google-oauth";

export async function disconnectGoogleAction(businessId: string): Promise<void> {
  await requireBusinessAccess(businessId);
  await disconnectGoogle(businessId);
}
