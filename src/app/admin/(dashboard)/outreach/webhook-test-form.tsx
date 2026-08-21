"use client";

import { useActionState, useState } from "react";
import { sendWebhookTestEmail, getWebhookTestTrace } from "./actions";

export function WebhookTestForm() {
  const [state, formAction, pending] = useActionState(sendWebhookTestEmail, null);
  const [trace, setTrace] = useState<Array<{ eventType: string; createdAt: string }> | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkTrace() {
    if (!state?.resendEmailId) return;
    setChecking(true);
    try {
      const result = await getWebhookTestTrace(state.resendEmailId);
      setTrace(result.events);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900 mb-1">Controlled webhook test</h2>
      <p className="text-sm text-zinc-500 mb-4">
        Sends ONE internal test email (tagged <code className="bg-zinc-100 px-1 rounded text-xs">type=webhook_test</code>,
        excluded from all outreach metrics) to an address you control — never a prospect. Use it to prove send → webhook →
        database end to end right now instead of waiting for organic events.
      </p>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          name="to"
          placeholder="you@gravyblock.com"
          required
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send test email"}
        </button>
      </form>
      {state?.error ? <p className="mt-2 text-xs text-red-600">{state.error}</p> : null}
      {state?.ok && state.resendEmailId ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <p className="text-xs text-zinc-600">
            Sent. Resend email id: <code className="font-mono">{state.resendEmailId}</code>. Open the email and click the
            link inside, then check for events below (may take a minute for Resend to fire the webhook).
          </p>
          <button
            onClick={checkTrace}
            disabled={checking}
            className="mt-2 rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-white disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check for events"}
          </button>
          {trace ? (
            trace.length ? (
              <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                {trace.map((e, i) => (
                  <li key={i}>
                    ✓ <span className="font-semibold">{e.eventType}</span> at {new Date(e.createdAt).toLocaleString()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-amber-700">No events received yet for this email id — try again shortly.</p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
