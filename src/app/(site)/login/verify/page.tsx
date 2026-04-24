import { redirect } from "next/navigation";
import { completeMagicLogin } from "@/lib/auth/customer-auth";

type Props = {
  searchParams: Promise<{ token?: string }>;
};

export const dynamic = "force-dynamic";

export default async function VerifyLoginPage({ searchParams }: Props) {
  const query = await searchParams;
  const token = query.token?.trim();
  if (!token) {
    redirect("/login");
  }

  const result = await completeMagicLogin(token);
  if (!result) {
    redirect("/login?error=expired");
  }

  if (result.redirectTo && result.redirectTo !== "/app") {
    redirect(result.redirectTo);
  }
  if (result.businesses.length === 1) {
    redirect(`/workspace/${result.businesses[0].id}`);
  }
  redirect("/app");
}

