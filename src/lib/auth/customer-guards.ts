import { redirect } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin-session";
import { canAccessBusiness, getCustomerSession } from "@/lib/auth/customer-auth";

function encodeNext(nextPath: string) {
  return encodeURIComponent(nextPath);
}

export async function requireCustomerSession(nextPath = "/app") {
  if (await isAdminSession()) return { email: "admin", businessIds: [] };
  const session = await getCustomerSession();
  if (!session) {
    redirect(`/login?next=${encodeNext(nextPath)}`);
  }
  return session;
}

export async function requireBusinessAccess(businessId: string, nextPath?: string) {
  if (await isAdminSession()) return;
  const allowed = await canAccessBusiness(businessId);
  if (!allowed) {
    redirect(`/login?next=${encodeNext(nextPath ?? `/workspace/${businessId}`)}`);
  }
}

