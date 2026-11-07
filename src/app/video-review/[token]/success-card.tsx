import type { SuccessView } from "@/lib/marketing-studio/publishing/review-flow";

/** The confirmation shown after a video is made public, with the GravyBlock Marketing Studio introduction below it. */
export function SuccessCard({ view }: { view: SuccessView }) {
  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{view.productName}</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Published successfully</h1>
        <a href={view.watchUrl} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.thumbUrl} alt={`Watch: ${view.title}`} className="block w-full" />
        </a>
        <p className="mt-3 text-sm font-medium text-zinc-900">{view.title}</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Live on YouTube</dt>
            <dd className="break-all text-right">
              <a className="text-blue-700 underline" href={view.watchUrl} target="_blank" rel="noreferrer">
                {view.watchUrl}
              </a>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Product destination</dt>
            <dd className="break-all text-right">{view.destination}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Visibility</dt>
            <dd className="font-semibold text-emerald-700">{view.visibility}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Same video</dt>
            <dd className="text-right">Video ID {view.videoId} was kept, so the link you reviewed is the public link. Nothing was re-uploaded.</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">Measurement</dt>
            <dd className="text-right">{view.measurement}</dd>
          </div>
        </dl>
      </section>
      <section className="rounded-2xl bg-zinc-900 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">GravyBlock Marketing Studio</p>
        <h2 className="mt-1 text-xl font-bold">Created, reviewed, published and measured by GravyBlock Marketing Studio.</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
          GravyBlock can create your marketing, send it where your customers are, measure what actually brings people in, and keep improving it automatically. You review a finished video from one email, approve it with one click, and it goes live.
        </p>
        <a href="https://gravyblock.com/how-it-works" className="mt-5 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900">
          See how GravyBlock works
        </a>
      </section>
    </div>
  );
}
