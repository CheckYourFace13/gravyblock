"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { changeRecommendationStatus, recordPromptCopied, recordReportOpened, verifyNow } from "./actions";
import type { Status } from "@/lib/search-intel/recommendation-model";

/** Records that the owner opened this report (a view only) once, when the page appears in an authenticated browser. */
export function OpenedBeacon({ businessId, weekEnding }: { businessId: string; weekEnding: string }) {
  useEffect(() => {
    void recordReportOpened(businessId, weekEnding);
  }, [businessId, weekEnding]);
  return null;
}

/** One-click copy of the complete development instruction. Copying flags the included recommendations as handed off; it never changes their status. */
export function CopyPrompt({ prompt, businessId, recommendationIds }: { prompt: string; businessId: string; recommendationIds: string[] }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(prompt);
      ok = true;
    } catch {
      ref.current?.focus();
      ref.current?.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    setState(ok ? "copied" : "manual");
    if (ok && recommendationIds.length) void recordPromptCopied(businessId, recommendationIds);
    setTimeout(() => setState("idle"), 4000);
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={copy} className="rounded-full bg-red-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-red-500">
        {state === "copied" ? "Copied" : "Copy for Claude/Cursor"}
      </button>
      <span className="ml-3 text-xs text-zinc-600">{recommendationIds.length} unresolved item(s) in this prompt. Copying marks them handed off; it does not mark them in progress or done.</span>
      {state === "manual" ? <span className="ml-3 text-xs text-zinc-600">Copy did not work in this browser: the text below is selected, press Ctrl+C (not recorded as handed off).</span> : null}
      <textarea ref={ref} readOnly value={prompt} className="h-80 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800" aria-label="Development instruction for this site" />
    </div>
  );
}

const BTN = "rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

/** One-click workflow buttons for one recommendation. */
export function StatusButtons({ businessId, recommendationId, status }: { businessId: string; recommendationId: string; status: Status }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const go = (to: Status) =>
    start(async () => {
      const r = await changeRecommendationStatus(businessId, recommendationId, to);
      setMsg(r.ok ? "" : r.reason ?? "not allowed");
    });
  const can = (...s: Status[]) => s.includes(status);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {can("new", "opened", "completed") ? <button className={BTN} disabled={pending} onClick={() => go("in_progress")}>Mark in progress</button> : null}
      {can("new", "opened", "in_progress") ? <button className={BTN} disabled={pending} onClick={() => go("completed")}>Mark completed</button> : null}
      {can("new", "opened", "in_progress", "completed", "verified") ? <button className={BTN} disabled={pending} onClick={() => go("dismissed")}>Dismiss</button> : null}
      {can("dismissed") ? <button className={BTN} disabled={pending} onClick={() => go("new")}>Restore</button> : null}
      {msg ? <span className="text-xs text-red-700">{msg}</span> : null}
    </span>
  );
}

export function VerifyNowButton({ businessId }: { businessId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-2">
      <button
        className={BTN}
        disabled={pending}
        onClick={() => start(async () => { const r = await verifyNow(businessId); setMsg(`${r.checked} checked, ${r.verified} verified, ${r.measured} outcomes measured`); })}
      >
        Check completed work now (read only)
      </button>
      {msg ? <span className="text-xs text-zinc-600">{msg}</span> : null}
    </span>
  );
}
