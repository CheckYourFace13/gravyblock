import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { embedFor, getReview } from "@/lib/marketing-studio/publishing/video-review";
import { approveVideoReviewAction, requestVideoChangesAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Video review", robots: { index: false, follow: false } };

const label: Record<string, string> = {
  unlisted_live: "Unlisted on YouTube, waiting for your decision",
  changes_requested: "Changes requested (still unlisted)",
  approved_pending_public: "Approved, but still unlisted (see the note below)",
  approved_public: "Approved and public",
  superseded: "Superseded by a newer version",
};

export default async function VideoReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; action?: string }> }) {
  await requireStudioAccess();
  const { id } = await params;
  const { e, action } = await searchParams;
  const r = await getReview(requireStudioDb(), id);
  if (!r) notFound();
  const embed = embedFor(r.videoId, r.title);
  const open = r.status === "unlisted_live" || r.status === "changes_requested" || r.status === "approved_pending_public";
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6 text-sm">
      <Link href="/admin/marketing-studio/review" className="text-xs text-zinc-500 underline">Marketing Studio review</Link>
      <h1 className="text-xl font-semibold">{r.productName}: video review</h1>
      <p className="rounded-lg bg-zinc-100 px-3 py-2 font-medium">{label[r.status] ?? r.status}</p>
      {e ? <p className="rounded-lg bg-amber-100 px-3 py-2 text-amber-900">{e}</p> : null}
      <p><a href={r.watchUrl} target="_blank" rel="noreferrer" className="font-semibold underline">Watch on YouTube</a> <span className="text-zinc-500">{r.watchUrl}</span></p>
      <dl className="space-y-2">
        <div><dt className="text-xs text-zinc-500">Proposed public title</dt><dd>{r.title}</dd></div>
        <div><dt className="text-xs text-zinc-500">Proposed public description</dt><dd className="whitespace-pre-wrap rounded bg-zinc-50 p-2 text-xs">{r.description}</dd></div>
        <div><dt className="text-xs text-zinc-500">Duration</dt><dd>{r.durationSec ? `${r.durationSec.toFixed(1)} seconds` : "unknown"}</dd></div>
        <div><dt className="text-xs text-zinc-500">CTA</dt><dd>{r.ctaText} to {r.ctaUrl}</dd></div>
        <div><dt className="text-xs text-zinc-500">Intended use</dt><dd>{r.intendedUse}</dd></div>
        <div><dt className="text-xs text-zinc-500">Privacy-enhanced embed code (recommendation only; Studio never edits a website)</dt><dd className="break-all rounded bg-zinc-50 p-2 font-mono text-[11px]">{embed.iframe}</dd></div>
        {r.changesNote ? <div><dt className="text-xs text-zinc-500">Your requested changes</dt><dd>{r.changesNote}</dd></div> : null}
      </dl>
      {open ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <form action={approveVideoReviewAction} className={`space-y-2 rounded-xl border p-3 ${action === "approve" ? "border-emerald-500" : "border-zinc-200"}`}>
            <input type="hidden" name="publicationId" value={id} />
            <p className="font-semibold">Approve and make public</p>
            <p className="text-xs text-zinc-600">Switches this same video from unlisted to public. Same link, no re-upload.</p>
            <button className="rounded-full bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white">Approve and make public</button>
          </form>
          <form action={requestVideoChangesAction} className={`space-y-2 rounded-xl border p-3 ${action === "changes" ? "border-zinc-700" : "border-zinc-200"}`}>
            <input type="hidden" name="publicationId" value={id} />
            <p className="font-semibold">Request changes</p>
            <textarea name="note" required rows={3} placeholder="What would you like changed?" className="w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs" />
            <button className="rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white">Request changes</button>
          </form>
        </div>
      ) : null}
    </main>
  );
}
