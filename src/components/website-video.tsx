import { WEBSITE_VIDEOS, type WebsiteVideoSlot } from "@/lib/website-videos";

/**
 * A dedicated GravyBlock website explainer, placed in a named slot (see src/lib/website-videos.ts). A slot with no video renders nothing at all, so there is never an empty frame or a
 * heading with nothing under it. The frame is 16:9 and its space is reserved (no layout shift); nothing is downloaded until the visitor presses play (preload none, poster only); it
 * never autoplays, so there is no sound until asked; it has native controls and a captions track. `flagship` is the larger, more prominent presentation used under the homepage hero.
 */
export function WebsiteVideo({ slot, heading, flagship = false }: { slot: WebsiteVideoSlot; heading?: string; flagship?: boolean }) {
  const v = WEBSITE_VIDEOS[slot];
  if (!v) return null;
  return (
    <section className={flagship ? "bg-zinc-950 px-4 py-14 sm:px-6 sm:py-16" : "px-4 py-12 sm:px-6"} aria-labelledby={`wv-${slot}`}>
      <div className={flagship ? "mx-auto max-w-5xl" : "mx-auto max-w-4xl"}>
        <div className="text-center">
          {heading ? <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${flagship ? "text-red-400" : "text-red-800"}`}>{heading}</p> : null}
          <h2 id={`wv-${slot}`} className={`mt-2 font-semibold tracking-tight ${flagship ? "text-3xl text-white sm:text-4xl" : "text-2xl text-zinc-900 sm:text-3xl"}`}>
            {v.title}
          </h2>
          <p className={`mx-auto mt-3 max-w-2xl text-sm sm:text-base ${flagship ? "text-zinc-300" : "text-zinc-600"}`}>
            {v.blurb} About {Math.round(v.seconds)} seconds. Press play for sound; it never starts by itself.
          </p>
        </div>
        <div className={`mt-7 overflow-hidden rounded-2xl border shadow-xl ${flagship ? "border-zinc-800 bg-black" : "border-zinc-200 bg-zinc-900"}`}>
          <video className="aspect-video w-full bg-black" controls preload="none" playsInline poster={v.poster} width={1920} height={1080} aria-label={v.title}>
            <source src={v.src} type="video/mp4" />
            {v.captions ? <track kind="captions" src={v.captions} srcLang="en" label="English" /> : null}
            Your browser cannot play this video. <a href={v.src}>Download it</a>.
          </video>
        </div>
      </div>
    </section>
  );
}
