import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { slotOfSpec } from "@/lib/marketing-studio/gravyblock-briefs";
import { listReviews } from "@/lib/marketing-studio/publishing/video-review";
import { VideoFacade } from "./video-facade";

/**
 * One of GravyBlock's own marketing videos, placed in the section of the site it belongs to (the slot). It renders ONLY a video the owner approved (status approved_public): nothing is
 * shown for a video that is still in review, and nothing breaks when there is none or the studio is unreachable. One slot shows one video, so a video is never embedded twice on a page.
 */
async function approvedFor(slot: string) {
  try {
    if (!studioEnabledByEnv()) return null;
    const reviews = await listReviews(requireStudioDb());
    return reviews.filter((r) => r.status === "approved_public" && r.specId && slotOfSpec(r.specId) === slot).sort((x, y) => (y.uploadedAt ?? "").localeCompare(x.uploadedAt ?? ""))[0] ?? null;
  } catch {
    return null;
  }
}

export async function PlacedVideo({ slot, heading }: { slot: string; heading?: string }) {
  const v = await approvedFor(slot);
  if (!v) return null;
  return (
    <aside className="px-4 py-10 sm:px-6" aria-label={`Video: ${v.title}`}>
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 sm:flex-row sm:gap-10">
        <VideoFacade videoId={v.videoId} title={v.title} />
        <div className="text-center sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">{heading ?? "Watch"}</p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-900">{v.title}</h2>
          <p className="mt-2 text-sm text-zinc-600">A short video, 25 seconds. Press play to watch with sound; it never starts by itself.</p>
        </div>
      </div>
    </aside>
  );
}
