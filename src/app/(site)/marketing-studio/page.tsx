import type { Metadata } from "next";
import Link from "next/link";
import { PlacedVideo } from "@/components/placed-video";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "GravyBlock Marketing Studio: short marketing videos from your real website",
  description: "Marketing Studio makes short marketing videos from your real website. Every video is emailed to you for review before anything is published.",
  alternates: { canonical: "/marketing-studio" },
};

const STEPS = [
  { title: "It starts from your real website", body: "Marketing Studio makes short marketing videos from your real website." },
  { title: "You review every video first", body: "Every video is emailed to you for review before anything is published." },
  { title: "You decide", body: "Approve it, request changes, or pause new videos, straight from the email." },
];

export default function MarketingStudioPage() {
  return (
    <div>
      <section className="border-b border-zinc-200 bg-gradient-to-b from-red-50 via-white to-white">
        <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">Marketing Studio</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">Marketing videos, made from your real website</h1>
          <p className="mt-4 max-w-2xl text-lg text-zinc-600">Marketing Studio is the part of GravyBlock that makes short marketing videos from your real website. You stay in control: nothing is published until you approve it.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/scan" className="inline-flex items-center justify-center rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500">Scan my business free</Link>
            <Link href="/how-it-works" className="inline-flex items-center justify-center rounded-full border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50">How GravyBlock works</Link>
          </div>
        </div>
      </section>
      <PlacedVideo slot="marketing-studio-page" heading="Marketing Studio" />
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <ol className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">{i + 1}</span>
              <h2 className="mt-4 text-lg font-semibold text-zinc-900">{s.title}</h2>
              <p className="mt-2 text-sm text-zinc-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
