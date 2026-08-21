"use client";

import { useState } from "react";
import { installWebhookSecret } from "./actions";

export function InstallWebhookSecretButton() {
  const [state, setState] = useState<{ ok: boolean; alreadyConfigured?: boolean; error?: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true);
    setState(null);
    try {
      const result = await installWebhookSecret();
      setState(result);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {pending ? "Installing…" : "Fetch real signing secret from Resend and install it"}
      </button>
      <p className="mt-1 text-[11px] text-zinc-400">
        Retrieves the signing secret for our registered webhook via the Resend API, writes it to the server&apos;s own
        .env file, and restarts the process. Never displays the secret itself.
      </p>
      {state ? (
        <p className={`mt-2 text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`}>
          {state.ok
            ? state.alreadyConfigured
              ? "Already correctly configured — no change made."
              : "Installed. The process is restarting now — check back in ~15 seconds and refresh this page."
            : `Failed: ${state.error}`}
        </p>
      ) : null}
    </div>
  );
}
