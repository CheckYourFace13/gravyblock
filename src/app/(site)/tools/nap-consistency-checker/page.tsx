import type { Metadata } from "next";
import Link from "next/link";
import { NapChecker } from "./nap-checker";

export const metadata: Metadata = {
  title: "Free NAP Consistency Checker",
  description: "Check whether your business name, address and phone number match between your Google listing and your own website. Free, no account needed.",
  alternates: { canonical: "/tools/nap-consistency-checker" },
};

export default function NapCheckerPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href="/tools" className="text-zinc-500 hover:text-zinc-800">
          Free tools
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span className="text-zinc-700">NAP Consistency Checker</span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">NAP Consistency Checker</h1>
      <p className="mt-4 text-lg text-zinc-600">
        NAP means name, address and phone. When your Google listing and your website disagree, customers and search engines get mixed signals. Find your
        business and we will compare the two.
      </p>
      <div className="mt-8">
        <NapChecker />
      </div>
      <section className="mt-12 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
        <h2 className="font-semibold text-zinc-900">What this checks, and what it does not</h2>
        <p className="mt-1">
          It compares your Google listing with the homepage of your own website. It does not check other directories; those need to be checked at the source. On a
          paid plan, GravyBlock keeps checking that your details agree across your website, Google and, where connected, Yelp and Facebook, and alerts you when they
          drift.
        </p>
      </section>
    </div>
  );
}
