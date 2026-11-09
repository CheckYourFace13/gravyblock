import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioEnabledByEnv } from "@/lib/marketing-studio/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirm review email", robots: { index: false, follow: false } };

/** Opening the link only shows a button (so a mail scanner cannot confirm anything); the confirmation itself is the POST. */
export default async function VerifyReviewEmailPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; e?: string }> }) {
  if (!studioEnabledByEnv()) notFound();
  const { token } = await params;
  const { done, e } = await searchParams;
  return (
    <main className="mx-auto min-h-screen max-w-xl bg-zinc-50 px-4 py-8 text-zinc-900">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {done ? (
          <>
            <h1 className="text-xl font-bold">Review email confirmed</h1>
            <p className="mt-2 text-sm text-zinc-700">Marketing Studio will send video reviews to this address from now on. Earlier review records are unchanged.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Use this address for video reviews?</h1>
            <p className="mt-2 text-sm text-zinc-700">Confirming makes this address the one Marketing Studio sends review, replacement and attention messages to.</p>
            {e ? <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{e}</p> : null}
            <form action="/api/video-review/verify" method="post" className="mt-5">
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-base font-bold text-white">CONFIRM THIS ADDRESS</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
