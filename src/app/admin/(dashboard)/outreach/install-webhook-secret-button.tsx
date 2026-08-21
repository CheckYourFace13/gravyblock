"use client";

import { useState } from "react";
import { installWebhookSecret, getLastSecretInstallRestartStatus } from "./actions";

export function InstallWebhookSecretButton() {
  const [state, setState] = useState<{ ok: boolean; alreadyConfigured?: boolean; error?: string; envPathUsed?: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [restartStatus, setRestartStatus] = useState<{ status: string; error: string | null; at: string } | null | undefined>(undefined);
  const [checkingRestart, setCheckingRestart] = useState(false);

  async function run() {
    setPending(true);
    setState(null);
    setRestartStatus(undefined);
    try {
      const result = await installWebhookSecret();
      setState(result);
    } finally {
      setPending(false);
    }
  }

  async function checkRestart() {
    setCheckingRestart(true);
    try {
      setRestartStatus(await getLastSecretInstallRestartStatus());
    } finally {
      setCheckingRestart(false);
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
        <div className="mt-2">
          <p className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-red-600"}`}>
            {state.ok
              ? state.alreadyConfigured
                ? "Already correctly configured — no change made."
                : `Wrote secret to ${state.envPathUsed ?? "the server's .env"}. Restarting now — check back in ~15 seconds.`
              : `Failed: ${state.error}`}
          </p>
          {state.ok && !state.alreadyConfigured ? (
            <button
              type="button"
              onClick={checkRestart}
              disabled={checkingRestart}
              className="mt-2 rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-white disabled:opacity-50"
            >
              {checkingRestart ? "Checking…" : "Check restart status"}
            </button>
          ) : null}
          {restartStatus !== undefined ? (
            <p className={`mt-1 text-xs ${restartStatus?.status === "done" ? "text-emerald-700" : restartStatus ? "text-red-600" : "text-amber-700"}`}>
              {restartStatus
                ? restartStatus.status === "done"
                  ? `PM2 restart succeeded at ${new Date(restartStatus.at).toLocaleTimeString()}.`
                  : `PM2 restart failed: ${restartStatus.error ?? "unknown error"}`
                : "No restart attempt recorded yet — try again in a few seconds."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
