import type { Metadata } from "next";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Share your experience — GravyBlock",
  description: "Tell us how GravyBlock is working for your business.",
  robots: { index: false, follow: false }, // private feedback page
};

type Props = { searchParams: Promise<{ b?: string }> };

export default async function FeedbackPage({ searchParams }: Props) {
  const { b: businessId } = await searchParams;

  return (
    <div className="mx-auto max-w-xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Your feedback</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
        How&apos;s GravyBlock working for you?
      </h1>
      <p className="mt-3 text-zinc-600">
        We&apos;re a small team and your honest words genuinely help. Takes 30 seconds.
      </p>

      <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <FeedbackForm businessId={businessId} />
      </div>
    </div>
  );
}
