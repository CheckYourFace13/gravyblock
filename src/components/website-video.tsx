/**
 * A dedicated GravyBlock website explainer (made directly for the site, separate from the Marketing Studio videos). 16:9, space reserved so nothing jumps, a poster image, nothing
 * downloaded until the visitor presses play (preload none), never autoplays so there is no sound until asked, native controls, and a captions track (captions are also burned in).
 */
export function WebsiteVideo({ src, poster, captions, title, heading, blurb, seconds }: { src: string; poster: string; captions: string; title: string; heading: string; blurb: string; seconds: number }) {
  return (
    <section className="px-4 py-12 sm:px-6" aria-label={`Video: ${title}`}>
      <div className="mx-auto max-w-4xl">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-800">{heading}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{title}</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-600">{blurb} {Math.round(seconds)} seconds. Press play to watch with sound; it never starts by itself.</p>
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-900 shadow-lg">
          <video className="aspect-video w-full" controls preload="none" playsInline poster={poster} width={1920} height={1080}>
            <source src={src} type="video/mp4" />
            <track kind="captions" src={captions} srcLang="en" label="English" />
            Your browser cannot play this video. <a href={src}>Download it</a>.
          </video>
        </div>
      </div>
    </section>
  );
}
