"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { customerLogoutAction } from "@/app/actions/customer-login";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await customerLogoutAction();
          router.push("/login");
        });
      }}
      className="rounded-full bg-zinc-100 border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:opacity-70"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}

