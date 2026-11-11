import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { openReview } from "@/lib/marketing-studio/publishing/review-flow";
import { QUICK_KINDS, QUICK_LABELS } from "@/lib/marketing-studio/revisions/types";
import { thumbUrlFor, watchUrlFor } from "@/lib/marketing-studio/publishing/video-review";
import { ApproveClient } from "./approve-client";
import { SuccessCard } from "./success-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Video review", robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-xl bg-zinc-50 px-4 py-8 text-zinc-900">{children}</main>;
}
function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Shell>
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-700">{children}</p>
      </section>
    </Shell>
  );
}

/**
 * The page behind the email buttons. Opening it only reads (and opens a short-lived transaction): the approval itself is a protected POST made by the page.
 * It needs no dashboard sign-in, so a reviewer can act straight from the email.
 */
export default async function VideoReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  if (!studioEnabledByEnv()) notFound();
  const { token } = await params;
  const { e } = await searchParams;
  const r = await openReview(requireStudioDb(), token, process.env.MARKETING_SECRET_KEY);
  if (r.kind === "invalid") return <Note title="This review link is not valid">Open the link from your most recent review email.</Note>;
  if (r.kind === "expired") return <Note title="This review link has expired">Review links last 14 days. Ask for a fresh review email, or sign in to the dashboard.</Note>;
  if (r.kind === "stale") return <Note title="This version is no longer waiting for a decision">It was replaced by a newer version or already handled. Use the link in your latest review email.</Note>;
  if (r.kind === "approved") {
    return (
      <Shell>
        <SuccessCard view={r.view} />
      </Shell>
    );
  }
  if (r.kind === "changes_received") {
    return <Note title="Change request received">Your note was saved. The video stays unlisted while a corrected version is made, checked and uploaded, and you will get a new review email with the new link.</Note>;
  }
  if (r.kind === "paused") {
    return <Note title="New video generation is paused">{r.state.productName} will not get any new videos made while this is paused. Videos that are already published stay live, and nothing you approved is changed. To start again, sign in to GravyBlock and press Resume video marketing.</Note>;
  }
  if (r.kind === "pause_ready") {
    return (
      <Shell>
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold">Pause new videos for {r.state.productName}?</h1>
          <p className="mt-2 text-sm text-zinc-700">No new concepts, renders or uploads will be made for {r.state.productName}. Anything already published stays live and nothing you approved is changed. You resume later from your GravyBlock dashboard.</p>
          {e ? <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{e}</p> : null}
          <form action="/api/video-review/pause" method="post" className="mt-5">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="txn" value={r.txn} />
            <button className="w-full rounded-xl bg-amber-700 px-5 py-3.5 text-base font-bold text-white">Pause new videos</button>
          </form>
        </section>
      </Shell>
    );
  }
  const s = r.state;
  if (r.kind === "approve_ready") {
    return (
      <Shell>
        <ApproveClient token={token} txn={r.txn} productName={s.productName} title={s.title} thumbUrl={thumbUrlFor(s.videoId)} watchUrl={watchUrlFor(s.videoId)} />
      </Shell>
    );
  }
  return (
    <Shell>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{s.productName}</p>
        <h1 className="mt-1 text-xl font-bold">{s.title}</h1>
        <a href={watchUrlFor(s.videoId)} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrlFor(s.videoId)} alt="Play the video" className="block w-full" />
        </a>
        <p className="mt-2 break-all text-sm">
          <a className="text-blue-700 underline" href={watchUrlFor(s.videoId)} target="_blank" rel="noreferrer">
            {watchUrlFor(s.videoId)}
          </a>
        </p>
        {e ? <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">{e}</p> : null}
        <form action="/api/video-review/changes" method="post" className="mt-5 space-y-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="txn" value={r.txn} />
          <label htmlFor="note" className="block text-base font-semibold">
            What would you like changed?
          </label>
          <textarea id="note" name="note" required rows={6} maxLength={2000} autoFocus placeholder="Say it in your own words, for example: remove the part about..., use a different example, say Wednesday instead of Wed, make it shorter." className="w-full rounded-xl border border-zinc-300 p-3 text-base" />
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-zinc-700">Optional: tick what kind of change this is (it only helps; your note is what counts)</legend>
            <div className="flex flex-wrap gap-2">
              {QUICK_KINDS.map((k) => (
                <label key={k} className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1.5 text-sm has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white">
                  <input type="checkbox" name="kind" value={k} className="sr-only" />
                  {QUICK_LABELS[k]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-zinc-700">
              Optional: where in the video?
              <select name="where" defaultValue="" className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 text-base font-normal">
                <option value="">Not sure or the whole video</option>
                <option value="beginning">Beginning</option>
                <option value="middle">Middle</option>
                <option value="end">End</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-zinc-700">
              Optional: scene or time, if you know it
              <input name="at" maxLength={120} placeholder="for example: second scene, or about 0:12" className="mt-1 w-full rounded-xl border border-zinc-300 p-2.5 text-base font-normal" />
            </label>
          </div>
          <button className="w-full rounded-xl bg-zinc-900 px-5 py-3.5 text-base font-bold text-white">Submit request</button>
          <p className="text-xs text-zinc-500">The video stays unlisted while it is corrected. You will get a new review email with the new link.</p>
        </form>
      </section>
    </Shell>
  );
}
