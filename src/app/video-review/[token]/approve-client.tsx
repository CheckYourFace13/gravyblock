"use client";

import { useEffect, useRef, useState } from "react";
import type { SuccessView } from "@/lib/marketing-studio/publishing/review-flow";
import { SuccessCard } from "./success-card";

type Phase = { name: "working" } | { name: "manual" } | { name: "done"; view: SuccessView } | { name: "error"; message: string };

/**
 * Opened from the owner's email, this page makes the one protected approval request by itself, so approving is a single click. A link scanner that
 * only fetches the page never reaches the request, and one that is recognisably automated gets a confirm button instead of an automatic approval.
 */
export function ApproveClient({ token, txn, productName, title, thumbUrl, watchUrl }: { token: string; txn: string; productName: string; title: string; thumbUrl: string; watchUrl: string }) {
  const [phase, setPhase] = useState<Phase>({ name: "working" });
  const started = useRef(false);

  async function approve() {
    setPhase({ name: "working" });
    try {
      const res = await fetch("/api/video-review/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, txn }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; view?: SuccessView; message?: string };
      if (res.ok && body.ok && body.view) setPhase({ name: "done", view: body.view });
      else setPhase({ name: "error", message: body.message ?? "Approval did not complete." });
    } catch {
      setPhase({ name: "error", message: "Could not reach the server. Nothing was changed; open the link again." });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const automated = navigator.webdriver === true || /bot|crawl|spider|headless|preview|scan|fetch|monitor/i.test(navigator.userAgent);
    if (automated) {
      setPhase({ name: "manual" });
      return;
    }
    const t = setTimeout(() => void approve(), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase.name === "done") return <SuccessCard view={phase.view} />;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{productName}</p>
      <h1 className="mt-1 text-xl font-bold text-zinc-900">{title}</h1>
      <a href={watchUrl} target="_blank" rel="noreferrer" className="mt-4 block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl} alt="" className="block w-full" />
      </a>
      {phase.name === "working" ? <p className="mt-4 text-sm text-zinc-700">Publishing this video. It stays the same YouTube video; only its visibility changes.</p> : null}
      {phase.name === "manual" ? (
        <div className="mt-4">
          <p className="text-sm text-zinc-700">This link looks like it was opened by an automated tool, so nothing was published. If you are the reviewer, confirm below.</p>
          <button onClick={() => void approve()} className="mt-3 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white">
            Approve and make public
          </button>
        </div>
      ) : null}
      {phase.name === "error" ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-red-800">{phase.message}</p>
          <button onClick={() => void approve()} className="mt-3 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white">
            Try again
          </button>
        </div>
      ) : null}
    </section>
  );
}
