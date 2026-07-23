"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { clearAdminSessionCookie, setAdminSessionCookie } from "@/lib/auth/admin-session";
import { isLockedOut, recordFailedAttempt, clearAttempts } from "@/lib/auth/admin-login-rate-limit";

export type AdminLoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

async function clientIp(): Promise<string> {
  const h = await headers();
  // First hop of x-forwarded-for is the original client behind the VPS's reverse proxy.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

export async function adminLoginAction(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const ip = await clientIp();

  const lock = isLockedOut(ip);
  if (lock.locked) {
    const minutes = Math.max(1, Math.ceil((lock.retryAfterSeconds ?? 0) / 60));
    return {
      status: "error",
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
    };
  }

  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (!expected) {
    return {
      status: "error",
      message: "Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SECRET.",
    };
  }

  if (password !== expected) {
    recordFailedAttempt(ip);
    return { status: "error", message: "Incorrect password." };
  }

  clearAttempts(ip);
  await setAdminSessionCookie();
  redirect("/admin");
}

export async function adminLogoutAction() {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
