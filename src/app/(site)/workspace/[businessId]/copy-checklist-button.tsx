"use client";

import { useState } from "react";

export function CopyChecklistButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-colors"
    >
      {copied ? "Copied!" : "Copy checklist for your developer"}
    </button>
  );
}
