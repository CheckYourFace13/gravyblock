"use client";

import { useState, useTransition } from "react";
import {
  connectWordPress, disconnectWordPress,
  connectWebflow, disconnectWebflow,
  connectShopify, disconnectShopify,
} from "./integrations-actions";

type Target = {
  id: string;
  label: string;
  adapter: string;
  active: string;
};

type ActiveForm = "wordpress" | "webflow" | "shopify" | null;

export function IntegrationsSection({
  businessId,
  initialTargets,
}: {
  businessId: string;
  initialTargets: Target[];
}) {
  const [targets, setTargets] = useState(initialTargets);
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // WordPress fields
  const [wpSiteUrl, setWpSiteUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");

  // Webflow fields
  const [wfSiteId, setWfSiteId] = useState("");
  const [wfCollectionId, setWfCollectionId] = useState("");
  const [wfApiToken, setWfApiToken] = useState("");

  // Shopify fields
  const [sfDomain, setSfDomain] = useState("");
  const [sfAccessToken, setSfAccessToken] = useState("");

  const wpTarget = targets.find((t) => t.adapter === "wordpress");
  const wfTarget = targets.find((t) => t.adapter === "webflow");
  const sfTarget = targets.find((t) => t.adapter === "shopify");

  function openForm(form: ActiveForm) {
    setStatus(null);
    setActiveForm((prev) => (prev === form ? null : form));
  }

  function handleConnectWp(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await connectWordPress(businessId, { siteUrl: wpSiteUrl, username: wpUsername, appPassword: wpAppPassword });
      if (result.ok) {
        setStatus({ ok: true, message: `Connected to ${result.siteName ?? wpSiteUrl}` });
        setActiveForm(null);
        setWpSiteUrl(""); setWpUsername(""); setWpAppPassword("");
        setTargets((prev) => [
          ...prev.filter((t) => t.adapter !== "wordpress"),
          { id: crypto.randomUUID(), label: result.siteName ? `WordPress: ${result.siteName}` : "WordPress", adapter: "wordpress", active: "true" },
        ]);
      } else {
        setStatus({ ok: false, message: result.error ?? "Connection failed" });
      }
    });
  }

  function handleDisconnectWp() {
    startTransition(async () => {
      await disconnectWordPress(businessId);
      setTargets((prev) => prev.filter((t) => t.adapter !== "wordpress"));
      setStatus({ ok: true, message: "WordPress disconnected." });
    });
  }

  function handleConnectWf(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await connectWebflow(businessId, { siteId: wfSiteId, collectionId: wfCollectionId, apiToken: wfApiToken });
      if (result.ok) {
        setStatus({ ok: true, message: `Connected to ${result.collectionName ?? "Webflow collection"}` });
        setActiveForm(null);
        setWfSiteId(""); setWfCollectionId(""); setWfApiToken("");
        setTargets((prev) => [
          ...prev.filter((t) => t.adapter !== "webflow"),
          { id: crypto.randomUUID(), label: result.collectionName ? `Webflow: ${result.collectionName}` : "Webflow", adapter: "webflow", active: "true" },
        ]);
      } else {
        setStatus({ ok: false, message: result.error ?? "Connection failed" });
      }
    });
  }

  function handleDisconnectWf() {
    startTransition(async () => {
      await disconnectWebflow(businessId);
      setTargets((prev) => prev.filter((t) => t.adapter !== "webflow"));
      setStatus({ ok: true, message: "Webflow disconnected." });
    });
  }

  function handleConnectSf(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await connectShopify(businessId, { shopDomain: sfDomain, accessToken: sfAccessToken });
      if (result.ok) {
        setStatus({ ok: true, message: `Connected to ${result.blogTitle ?? "Shopify blog"}` });
        setActiveForm(null);
        setSfDomain(""); setSfAccessToken("");
        setTargets((prev) => [
          ...prev.filter((t) => t.adapter !== "shopify"),
          { id: crypto.randomUUID(), label: result.blogTitle ? `Shopify: ${result.blogTitle}` : "Shopify", adapter: "shopify", active: "true" },
        ]);
      } else {
        setStatus({ ok: false, message: result.error ?? "Connection failed" });
      }
    });
  }

  function handleDisconnectSf() {
    startTransition(async () => {
      await disconnectShopify(businessId);
      setTargets((prev) => prev.filter((t) => t.adapter !== "shopify"));
      setStatus({ ok: true, message: "Shopify disconnected." });
    });
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Publishing integrations</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Connect your CMS to auto-publish AI-generated content directly to your blog or site.
      </p>

      {status ? (
        <div className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${status.ok ? "bg-green-50 text-green-800 border border-green-100" : "bg-red-50 text-red-800 border border-red-100"}`}>
          {status.message}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {/* WordPress */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
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
                onClick={handleDisconnectWp}
                disabled={isPending}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => openForm("wordpress")}
                className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                {activeForm === "wordpress" ? "Cancel" : "Connect"}
              </button>
            )}
          </div>
          {activeForm === "wordpress" && !wpTarget ? (
            <form onSubmit={handleConnectWp} className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">
                Go to <strong>WordPress Admin → Users → Profile → Application Passwords</strong> and create a new password for GravyBlock.
              </p>
              <input type="url" placeholder="https://yourblog.com" value={wpSiteUrl} onChange={(e) => setWpSiteUrl(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <input type="text" placeholder="WordPress username" value={wpUsername} onChange={(e) => setWpUsername(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <input type="password" placeholder="Application password (xxxx xxxx xxxx xxxx)" value={wpAppPassword} onChange={(e) => setWpAppPassword(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
                  {isPending ? "Testing…" : "Connect WordPress"}
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600">Cancel</button>
              </div>
            </form>
          ) : null}
        </div>

        {/* Webflow */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#146ef5]">
                <span className="text-xs font-bold text-white">WF</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Webflow</p>
                {wfTarget ? (
                  <p className="text-xs text-green-700 font-medium">{wfTarget.label} — connected</p>
                ) : (
                  <p className="text-xs text-zinc-500">Publish content items to your Webflow CMS collection</p>
                )}
              </div>
            </div>
            {wfTarget ? (
              <button
                onClick={handleDisconnectWf}
                disabled={isPending}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => openForm("webflow")}
                className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                {activeForm === "webflow" ? "Cancel" : "Connect"}
              </button>
            )}
          </div>
          {activeForm === "webflow" && !wfTarget ? (
            <form onSubmit={handleConnectWf} className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">
                In Webflow, go to <strong>Project Settings → Integrations → API Access</strong> and generate a token. You'll also need your Site ID and the Collection ID for your blog posts.
              </p>
              <input type="text" placeholder="Site ID (from Webflow Project Settings)" value={wfSiteId} onChange={(e) => setWfSiteId(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <input type="text" placeholder="Collection ID (the blog posts collection)" value={wfCollectionId} onChange={(e) => setWfCollectionId(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <input type="password" placeholder="Webflow API token" value={wfApiToken} onChange={(e) => setWfApiToken(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
                  {isPending ? "Testing…" : "Connect Webflow"}
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600">Cancel</button>
              </div>
            </form>
          ) : null}
        </div>

        {/* Shopify */}
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#96bf48]">
                <span className="text-xs font-bold text-white">SF</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900">Shopify</p>
                {sfTarget ? (
                  <p className="text-xs text-green-700 font-medium">{sfTarget.label} — connected</p>
                ) : (
                  <p className="text-xs text-zinc-500">Publish blog articles directly to your Shopify store</p>
                )}
              </div>
            </div>
            {sfTarget ? (
              <button
                onClick={handleDisconnectSf}
                disabled={isPending}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600 hover:border-zinc-300 disabled:opacity-50"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => openForm("shopify")}
                className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                {activeForm === "shopify" ? "Cancel" : "Connect"}
              </button>
            )}
          </div>
          {activeForm === "shopify" && !sfTarget ? (
            <form onSubmit={handleConnectSf} className="mt-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs text-zinc-500">
                In Shopify admin go to <strong>Apps → Develop apps → Create an app</strong>, enable the <code>write_content</code> scope, and install it to get an access token.
              </p>
              <input type="text" placeholder="mystore.myshopify.com" value={sfDomain} onChange={(e) => setSfDomain(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <input type="password" placeholder="Admin API access token (shpat_…)" value={sfAccessToken} onChange={(e) => setSfAccessToken(e.target.value)} required className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none" />
              <div className="flex gap-2">
                <button type="submit" disabled={isPending} className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
                  {isPending ? "Testing…" : "Connect Shopify"}
                </button>
                <button type="button" onClick={() => setActiveForm(null)} className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-600">Cancel</button>
              </div>
            </form>
          ) : null}
        </div>

        {/* Ghost — still coming soon */}
        <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50/50 p-4 opacity-60">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-200">
              <span className="text-xs font-bold text-zinc-500">G</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-700">Ghost</p>
              <p className="text-xs text-zinc-400">Coming soon</p>
            </div>
          </div>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Soon</span>
        </div>
      </div>
    </section>
  );
}
