"use client";

import { useState } from "react";

/**
 * A video that costs the page nothing until it is wanted: the poster is a lazy-loaded image of the video itself, and the player (privacy-enhanced youtube-nocookie) is created only when the
 * visitor presses play. It never autoplays, so there is no sound until the visitor asks for it, and the space is reserved (9:16) so nothing jumps.
 */
export function VideoFacade({ videoId, title }: { videoId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="relative mx-auto aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-sm">
      {playing ? (
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`}
          title={title}
          allow="encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} aria-label={`Play video: ${title}`} className="group absolute inset-0 block h-full w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} alt="" loading="lazy" decoding="async" width={480} height={360} className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 transition group-hover:bg-black/20">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-red-700 shadow-lg" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
