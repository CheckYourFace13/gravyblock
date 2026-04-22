"use server";

import { redirect } from "next/navigation";
import { clearAdminSessionCookie, setAdminSessionCookie } from "@/lib/auth/admin-session";

export type AdminLoginState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success" };

export async function adminLoginAction(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_PASSWORD ?? "";

  if (!expected) {
    return {
      status: "error",
      message: "Admin login is not configured. Set ADMIN_PASSWORD and ADMIN_SECRET.",
    };
  }

  if (password !== expected) {
    return { status: "error", message: "Incorrect password." };
  }

  await setAdminSessionCookie();
  redirect("/admin");
}

export async function adminLogoutAction() {
  await clearAdminSessionCookie();
  redirect("/admin/login");
}
