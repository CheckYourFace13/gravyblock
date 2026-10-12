"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { checkNapAction, type NapResult } from "./actions";

type Candidate = { placeId: string; displayName: string; formattedAddress?: string };

const SCAN_HREF = "/scan?utm_source=tool&utm_medium=nap_checker&utm_campaign=free_tool";
const START_HREF = "/start?plan=growth&promo=GROWTH50&utm_source=tool&utm_medium=nap_checker&utm_campaign=free_tool";

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  match: { text: "Matches", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  different: { text: "Different", cls: "bg-red-50 text-red-800 border-red-200" },
  not_on_website: { text: "Not found on your homepage", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  not_on_google: { text: "Missing on Google", cls: "bg-amber-50 text-amber-800 border-amber-200" },
};

export function NapChecker() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [result, setResult] = useState<NapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setCandidates(null);
    const res = await fetch("/api/google/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, locationHint: city }),
    }).catch(() => null);
    const data = res && res.ok ? await res.json().catch(() => null) : null;
    if (!data?.candidates?.length) {
      setError("We could not find that business. Try the exact name and the city.");
      return;
    }
    setCandidates(data.candidates as Candidate[]);
  }

  function check(c: Candidate) {
    setError(null);
    start(async () => {
      const r = await checkNapAction(c.placeId);
      setResult(r);
      setCandidates(null);
    });
  }

  return (
    <div>
      <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input value={query} onChange={(e) => setQuery(e.target.value)} required placeholder="Business name" className="rounded-full border border-zinc-300 px-5 py-3 text-sm outline-none focus:ring-4 focus:ring-red-500/20" />
        <input value={city} onChange={(e) => setCity(e.target.value)} required placeholder="City or address" className="rounded-full border border-zinc-300 px-5 py-3 text-sm outline-none focus:ring-4 focus:ring-red-500/20" />
        <button type="submit" disabled={pending} className="rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-60">
          Find my business
        </button>
      </form>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {candidates ? (
        <ul className="mt-4 space-y-2">
          {candidates.map((c) => (
            <li key={c.placeId}>
              <button onClick={() => check(c)} disabled={pending} className="w-full rounded-2xl border border-zinc-200 bg-white p-4 text-left text-sm hover:border-red-300 disabled:opacity-60">
                <span className="font-semibold text-zinc-900">{c.displayName}</span>
                <span className="block text-zinc-500">{c.formattedAddress}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {pending ? <p className="mt-4 text-sm text-zinc-600">Checking your Google listing and website…</p> : null}
      {result && !result.ok ? <p className="mt-4 text-sm text-red-700">{result.error}</p> : null}
      {result && result.ok ? (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-zinc-900">{result.businessName}</h2>
          {!result.website ? <p className="mt-1 text-sm text-zinc-600">Your Google listing has no website, so there was nothing to compare against.</p> : null}
          {result.website && !result.websiteChecked ? <p className="mt-1 text-sm text-zinc-600">We could not read {result.website}, so website details are missing below.</p> : null}
          <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2">Detail</th>
                  <th className="px-4 py-2">Google listing</th>
                  <th className="px-4 py-2">Your website</th>
                  <th className="px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.field} className="border-t border-zinc-100 align-top">
                    <td className="px-4 py-3 font-medium text-zinc-900">{r.field}</td>
                    <td className="px-4 py-3 text-zinc-700">{r.google ?? "—"}</td>
                    <td className="px-4 py-3 text-zinc-700">{r.website ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_LABEL[r.status].cls}`}>{STATUS_LABEL[r.status].text}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/60 p-6">
            <p className="text-lg font-semibold text-zinc-900">Want GravyBlock to keep monitoring this and work on your visibility automatically?</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={SCAN_HREF} className="rounded-full bg-red-600 px-7 py-3 text-sm font-bold text-white hover:bg-red-500">
                Scan my business free
              </Link>
              <Link href={START_HREF} className="text-sm font-semibold text-zinc-700 underline">
                Start GravyBlock — $74.99/mo
              </Link>
            </div>
            <p className="mt-2 text-xs text-zinc-600">$74.99/month locked while subscribed · Cancel anytime · 30-day money-back guarantee</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
