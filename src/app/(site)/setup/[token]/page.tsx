import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSetupToken } from "@/lib/setup/tokens";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Set up your account — GravyBlock",
  robots: { index: false },
};

export default async function SetupPage({ params }: Props) {
  const { token } = await params;
  const resolved = await resolveSetupToken(token);
  if (!resolved) notFound();

  const { business } = resolved;
  const businessName = business?.name ?? "your business";

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Account setup</p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Tell us about {businessName}
        </h1>
        <p className="max-w-2xl text-zinc-600">
          GravyBlock uses this to write content, find the right places to post, and run outreach that
          actually sounds like you. Takes about 2 minutes, no login required.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <SetupForm token={token} businessName={businessName} />
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        This link is unique to your account and expires in 7 days. Questions?{" "}
        <a href="mailto:hello@gravyblock.com" className="text-red-800 hover:underline">
          hello@gravyblock.com
        </a>
      </p>
    </div>
  );
}
