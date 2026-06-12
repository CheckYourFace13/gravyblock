"use client";

import { useState } from "react";
import Link from "next/link";

const INDUSTRY_PRESETS: { label: string; jobValue: number; searches: number }[] = [
  { label: "HVAC",              jobValue: 450, searches: 1800 },
  { label: "Plumber",           jobValue: 350, searches: 2200 },
  { label: "Roofing",           jobValue: 8500, searches: 900 },
  { label: "Dentist",           jobValue: 600, searches: 2600 },
  { label: "Lawyer",            jobValue: 2500, searches: 1500 },
  { label: "Med spa",           jobValue: 350, searches: 1300 },
  { label: "Chiropractor",      jobValue: 280, searches: 1100 },
  { label: "Electrician",       jobValue: 400, searches: 1400 },
  { label: "Auto repair",       jobValue: 380, searches: 1900 },
  { label: "Salon",             jobValue: 90,  searches: 2400 },
  { label: "Restaurant",        jobValue: 45,  searches: 6000 },
  { label: "Other",             jobValue: 300, searches: 1200 },
];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function RoiCalculator() {
  const [industryIdx, setIndustryIdx] = useState(0);
  const [searches, setSearches] = useState(INDUSTRY_PRESETS[0].searches);
  const [jobValue, setJobValue] = useState(INDUSTRY_PRESETS[0].jobValue);
  const [closeRate, setCloseRate] = useState(30);

  function pickIndustry(idx: number) {
    setIndustryIdx(idx);
    setSearches(INDUSTRY_PRESETS[idx].searches);
    setJobValue(INDUSTRY_PRESETS[idx].jobValue);
  }

  // Top-3 capture ~70% of clicks, split ~3 ways → one top-3 spot sees ~23% of searches.
  // Conservative: ~8% of searchers contact a given top-3 business (click→call dropoff).
  const monthlyLeads = Math.round(searches * 0.08);
  const monthlyCustomers = Math.max(1, Math.round(monthlyLeads * (closeRate / 100)));
  const monthlyRevenue = monthlyCustomers * jobValue;
  const yearlyRevenue = monthlyRevenue * 12;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Industry */}
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Your industry</p>
      <div className="flex flex-wrap gap-2">
        {INDUSTRY_PRESETS.map((ind, i) => (
          <button
            key={ind.label}
            type="button"
            onClick={() => pickIndustry(i)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              industryIdx === i
                ? "bg-red-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            {ind.label}
          </button>
        ))}
      </div>

      {/* Sliders */}
      <div className="mt-7 grid gap-6 sm:grid-cols-3">
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-600">Monthly local searches</label>
            <span className="text-sm font-bold text-zinc-900 tabular-nums">{searches.toLocaleString()}</span>
          </div>
          <input
            type="range" min={100} max={10000} step={100}
            value={searches}
            onChange={(e) => setSearches(parseInt(e.target.value, 10))}
            className="w-full accent-red-600"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-600">Average job value</label>
            <span className="text-sm font-bold text-zinc-900 tabular-nums">{money(jobValue)}</span>
          </div>
          <input
            type="range" min={25} max={10000} step={25}
            value={jobValue}
            onChange={(e) => setJobValue(parseInt(e.target.value, 10))}
            className="w-full accent-red-600"
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-1.5">
            <label className="text-xs font-medium text-zinc-600">Your close rate</label>
            <span className="text-sm font-bold text-zinc-900 tabular-nums">{closeRate}%</span>
          </div>
          <input
            type="range" min={5} max={80} step={5}
            value={closeRate}
            onChange={(e) => setCloseRate(parseInt(e.target.value, 10))}
            className="w-full accent-red-600"
          />
        </div>
      </div>

      {/* Result */}
      <div className="mt-8 rounded-2xl bg-gradient-to-br from-red-600 to-red-700 p-6 text-center sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-red-200">
          A top-3 Google ranking is worth roughly
        </p>
        <p className="mt-2 text-5xl font-black text-white tabular-nums">{money(monthlyRevenue)}<span className="text-2xl font-bold text-red-200">/mo</span></p>
        <p className="mt-1 text-sm text-red-100">
          ≈ {money(yearlyRevenue)}/year · {monthlyCustomers} new customer{monthlyCustomers !== 1 ? "s" : ""}/month from {monthlyLeads} search leads
        </p>
        <p className="mt-4 text-xs text-red-200/80 max-w-md mx-auto">
          Conservative estimate: assumes one top-3 spot converts ~8% of monthly searches into contacts at your close rate, first transaction only.
        </p>
        <Link
          href="/scan"
          className="mt-5 inline-block rounded-full bg-white px-7 py-3 text-sm font-bold text-red-700 hover:bg-red-50"
        >
          See if I&apos;m in the top 3 — free scan →
        </Link>
      </div>
    </div>
  );
}
