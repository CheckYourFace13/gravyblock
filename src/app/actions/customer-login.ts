"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { clearCustomerSession, createMagicLink } from "@/lib/auth/customer-auth";
import { sendCustomerMagicLinkEmail } from "@/lib/integrations/resend";

const schema = z.object({
  email: z.string().trim().email("Valid email is required"),
  redirectTo: z.string().optional(),
});

export type CustomerLoginState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function requestCustomerMagicLinkAction(
  _prev: CustomerLoginState,
  formData: FormData,
): Promise<CustomerLoginState> {
  const parsed = schema.safeParse({
    email: String(formData.get("email") ?? ""),
    redirectTo: String(formData.get("redirectTo") ?? ""),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.flatten().fieldErrors.email?.[0] ?? "Invalid email" };
  }
  try {
    const link = await createMagicLink({
      email: parsed.data.email,
      redirectTo: parsed.data.redirectTo || "/app",
    });
    void sendCustomerMagicLinkEmail({
      email: parsed.data.email,
      verifyUrl: link.verifyUrl,
      expiresMinutes: 20,
    }).catch((error) => {
      console.error("[customer-login] magic link email failed", { error });
    });
  } catch (error) {
    console.error("[customer-login] failed to issue magic link", { error });
    return { status: "error", message: "Could not send sign-in link right now." };
  }
  redirect("/login/check-email");
}

export async function customerLogoutAction() {
  await clearCustomerSession();
  redirect("/login");
}

