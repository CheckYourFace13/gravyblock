"use client";

import { useState, useTransition } from "react";
import { saveSocialCredentials, type SocialCredentials } from "./social-credentials-actions";

type Props = {
  businessId: string;
  initial: SocialCredentials | null;
};

const EMPTY: SocialCredentials = {
  facebookPageId: "",
  facebookAccessToken: "",
  instagramAccountId: "",
};

export function SocialCredentialsSection({ businessId, initial }: Props) {
  const [form, setForm] = useState<SocialCredentials>(initial ?? EMPTY);
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function field(key: keyof SocialCredentials) {
    return {
      value: form[key],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((prev) => ({ ...prev, [key]: e.target.value })),
    };
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await saveSocialCredentials(businessId, form);
      if (result.ok) {
        setStatus({ ok: true, message: "Credentials saved. Facebook and Instagram auto-posting is now active." });
      } else {
        setStatus({ ok: false, message: result.error ?? "Save failed." });
      }
    });
  }

  const isConnected = Boolean(initial?.facebookPageId && initial?.facebookAccessToken);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Facebook + Instagram auto-posting</h2>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Connect your Facebook Page and Instagram Business account. GravyBlock will automatically post content on your behalf.
          </p>
        </div>
        {isConnected ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">Connected</span>
        ) : (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-500">Not connected</span>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-zinc-700">
        <p className="font-semibold text-zinc-900">How to get these credentials</p>
        <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-zinc-600">
          <li>Go to <a href="https://developers.facebook.com" className="text-blue-700 underline" target="_blank" rel="noreferrer">developers.facebook.com</a> → My Apps → create an app</li>
          <li>Add the <strong>Pages API</strong> product, get your <strong>Page Access Token</strong> (long-lived, 60 days)</li>
          <li>Your <strong>Page ID</strong> is visible in your Facebook Page settings under "About"</li>
          <li>For Instagram: link your IG Business account to the Facebook Page, then use the <strong>Instagram Business Account ID</strong> from the Graph API Explorer</li>
        </ol>
      </div>

      {status ? (
        <div className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      ) : null}

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Facebook Page ID
            </label>
            <input
              type="text"
              {...field("facebookPageId")}
              placeholder="e.g. 123456789012345"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Instagram Business Account ID <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <input
              type="text"
              {...field("instagramAccountId")}
              placeholder="e.g. 17841400008460056"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Facebook Page Access Token
            </label>
            <div className="relative mt-1.5">
              <input
                type={showToken ? "text" : "password"}
                {...field("facebookAccessToken")}
                placeholder="EAAxxxxxxxxxxxxxxx..."
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 pr-20 text-sm focus:border-zinc-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-500 hover:text-zinc-700"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-400">Stored encrypted. Use a long-lived Page Access Token (60-day or permanent via System User).</p>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-zinc-100 pt-4">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Save credentials"}
          </button>
          {isConnected ? (
            <p className="text-xs text-zinc-500">Autopilot will post to Facebook on the next scheduled run.</p>
          ) : (
            <p className="text-xs text-zinc-500">Posts will begin on the next autopilot run after saving.</p>
          )}
        </div>
      </form>
    </section>
  );
}
