"use client";

import { useRef, useState } from "react";

/** One-click copy of the complete development instruction. Falls back to selecting the text when the clipboard API is unavailable. */
export function CopyPrompt({ prompt }: { prompt: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setState("copied");
    } catch {
      ref.current?.focus();
      ref.current?.select();
      try {
        setState(document.execCommand("copy") ? "copied" : "manual");
      } catch {
        setState("manual");
      }
    }
    setTimeout(() => setState("idle"), 4000);
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={copy} className="rounded-full bg-red-600 px-6 py-3 text-sm font-bold uppercase tracking-wide text-white hover:bg-red-500">
        {state === "copied" ? "Copied" : "Copy for Claude/Cursor"}
      </button>
      {state === "manual" ? <span className="ml-3 text-xs text-zinc-600">Copy did not work in this browser: the text below is selected, press Ctrl+C.</span> : null}
      <textarea ref={ref} readOnly value={prompt} className="h-80 w-full rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-800" aria-label="Development instruction for this site" />
    </div>
  );
}
