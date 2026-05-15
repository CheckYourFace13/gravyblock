"use client";

import { useTransition } from "react";
import { disconnectGoogleAction } from "./google-integrations-actions";

type Props = {
  businessId: string;
  connected: boolean;
  googleEmail: string | null;
  searchConsoleProperty: string | null;
  gbpLocationName: string | null;
  errorParam: string | null;
  successParam: boolean;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Google sign-in was cancelled or returned incomplete data.",
  invalid_state: "The sign-in request expired. Please try again.",
  token_exchange: "Could not complete sign-in. Check that your Google account has Search Console and Business Profile access.",
  missing_refresh_token: "Google did not return a refresh token. Please disconnect and reconnect.",
};

export function GoogleIntegrationsSection({
  businessId,
  connected,
  googleEmail,
  searchConsoleProperty,
  gbpLocationName,
  errorParam,
  successParam,
}: Props) {
  const [isPending, startTransition] = useTransition();

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectGoogleAction(businessId);
      window.location.reload();
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Google integrations</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Connect your Google account to pull real Search Console ranking data and post directly to your Google Business Profile. No third-party tools needed.
          </p>
        </div>
        {connected ? (
          <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
            Connected
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500">
            Not connected
          </span>
        )}
      </div>

      {successParam ? (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Google connected successfully. Search Console data and GBP posting are now active.
        </div>
      ) : null}

      {errorParam ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {ERROR_MESSAGES[errorParam] ?? `Sign-in error: ${errorParam}`}
        </div>
      ) : null}

      {connected ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Google account</p>
              <p className="mt-1 text-sm text-zinc-800 break-all">{googleEmail ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Search Console property</p>
              <p className="mt-1 text-sm text-zinc-800 break-all">{searchConsoleProperty ?? "Auto-detecting…"}</p>
            </div>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">GBP location</p>
              <p className="mt-1 text-sm text-zinc-800 break-all">{gbpLocationName ?? "Auto-detecting…"}</p>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">What you get</p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-600">
              <li>✓ Real keyword rankings, clicks, and impressions from Search Console</li>
              <li>✓ AI-written GBP posts published directly, no copy-pasting</li>
              <li>✓ Automated review replies drafted and sent</li>
              <li>✓ Q&As posted to your profile automatically</li>
            </ul>
          </div>

          <button
            onClick={handleDisconnect}
            disabled={isPending}
            className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
          >
            {isPending ? "Disconnecting…" : "Disconnect Google"}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-sm text-zinc-700">
            <p className="font-semibold text-zinc-900">What you get after connecting</p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-600">
              <li>✓ Real keyword rankings from Search Console (not estimates)</li>
              <li>✓ GBP posts published directly from your automation queue</li>
              <li>✓ Review replies sent automatically</li>
              <li>✓ Q&As added to your Google Business Profile</li>
            </ul>
          </div>
          <a
            href={`/api/auth/google/start?businessId=${businessId}`}
            className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Connect Google account
          </a>
          <p className="text-xs text-zinc-500">
            You&apos;ll authorize GravyBlock to read your Search Console data and manage your Google Business Profile. You can disconnect at any time.
          </p>
        </div>
      )}
    </section>
  );
}
