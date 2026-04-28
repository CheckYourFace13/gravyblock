"use client";

import { useState, useTransition } from "react";
import { connectWordPress, disconnectWordPress } from "./integrations-actions";

type Target = {
  id: string;
  label: string;
  adapter: string;
  active: string;
};

export function IntegrationsSection({
  businessId,
  initialTargets,
}: {
  businessId: string;
  initialTargets: Target[];
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [showForm, setShowForm] = useState(false);
  const [siteUrl, setSiteUrl] = useState("");
  const [username, setUsername] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const wpTarget = targets.find((t) => t.adapter === "wordpress");

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await connectWordPress(businessId, { siteUrl, username, appPassword });
      if (result.ok) {
        setStatus({ ok: true, message: `Connected to ${result.siteName ?? siteUrl}` });
        setShowForm(false);
        setSiteUrl(""); setUsername(""); setAppPassword("");
        setTargets((prev) => [
          ...prev.filter((t) => t.adapter !== "wordpress"),
          { id: crypto.randomUUID(), label: result.siteName ? `WordPress: ${result.siteName}` : "WordPress", adapter: "wordpress", active: "true" },
        ]);
      } else {
        setStatus({ ok: false, message: result.error ?? "Connection failed" });
      }
    });
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectWordPress(businessId);
      setTargets((prev) => prev.filter((t) => t.adapter !== "wordpress"));
      setStatus({ ok: true, message: "WordPress disconnected." });
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Publishing integrations</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Connect your WordPress site to auto-publish AI-generated content directly to your blog.
      </p>

      {status ? (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {/* WordPress */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#21759b]">
              <span className="text-xs font-bold text-white">WP</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">WordPress</p>
              {wpTarget ? (
                <p className="text-xs text-green-700 font-medium">{wpTarget.label} — connected</p>
              ) : (
                <p className="text-xs text-zinc-500">Auto-publish articles to your WordPress blog</p>
              )}
            </div>
          </div>
          {wpTarget ? (
            <button
              onClick={handleDisconnect}
              disabled={isPending}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:opacity-50"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => setShowForm(!showForm)}
              className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
            >
              Connect
            </button>
          )}
        </div>

        {/* Placeholder integrations */}
        {(["Webflow", "Shopify", "Ghost"] as const).map((name) => (
          <div key={name} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 opacity-60">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200">
                <span className="text-xs font-bold text-zinc-500">{name[0]}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-700">{name}</p>
                <p className="text-xs text-zinc-400">Coming soon</p>
              </div>
            </div>
            <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Soon</span>
          </div>
        ))}
      </div>

      {showForm && !wpTarget ? (
        <form onSubmit={handleConnect} className="mt-5 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-semibold text-zinc-800">Connect your WordPress site</p>
          <p className="text-xs text-zinc-500">
            Go to <strong>WordPress Admin → Users → Profile → Application Passwords</strong> and create a new password for GravyBlock.
          </p>
          <div className="space-y-2">
            <input
              type="url"
              placeholder="https://yourblog.com"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="WordPress username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Application password (xxxx xxxx xxxx xxxx)"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {isPending ? "Testing connection…" : "Connect WordPress"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
