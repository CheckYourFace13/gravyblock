import type { Metadata } from "next";
import Link from "next/link";
import { ReplyGenerator } from "./reply-generator";

export const metadata: Metadata = {
  title: "Free Google Review Reply Generator",
  description: "Paste a customer review and get a professional reply you can post on Google. Free, no account needed, and nothing is stored.",
  alternates: { canonical: "/tools/review-reply-generator" },
};

export default function ReplyGeneratorPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="mb-4 text-sm">
        <Link href="/tools" className="text-zinc-500 hover:text-zinc-800">
          Free tools
        </Link>
        <span className="mx-2 text-zinc-400">/</span>
        <span className="text-zinc-700">Review Reply Generator</span>
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Free tool</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900">Google Review Reply Generator</h1>
      <p className="mt-4 text-lg text-zinc-600">
        Replying to reviews shows customers you pay attention. Paste a review and get a reply you can edit and post. We don&apos;t store what you paste, and the reply is
        AI-written, so read it before you post it.
      </p>
      <div className="mt-8">
        <ReplyGenerator />
      </div>
    </div>
  );
}
