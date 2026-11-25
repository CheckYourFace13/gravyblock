import type { Metadata } from "next";
import Link from "next/link";
import { listHouseAccounts } from "@/lib/house";
import { loadReports, summarizePortfolio } from "@/lib/search-intel";
import { weekEndingFor } from "@/lib/search-intel/gather";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Weekly search and competitor reports" };

export default async function SearchReportsIndex() {
  const week = weekEndingFor(new Date());
  const houses = await listHouseAccounts();
  const reports = await loadReports(week);
  const s = summarizePortfolio(reports, houses.map((h) => h.name), week);
  return (
    <div className="space-y-4 p-6 text-sm">
      <h1 className="text-xl font-semibold text-zinc-900">Weekly search and competitor reports, week ending {week}</h1>
      <p className="text-zinc-600">Google search clicks and impressions only (not total website visitors). Read only: GravyBlock never edits these sites; each report ends with one prompt for the site&apos;s own developer.</p>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-300 text-xs uppercase text-zinc-500">
            <th className="py-2">Site</th><th>28-day clicks</th><th>vs before</th><th>7-day clicks</th><th>vs before</th><th>Data</th><th></th>
          </tr>
        </thead>
        <tbody>
          {houses.map((h) => {
            const r = s.rows.find((x) => x.businessId === h.id);
            return (
              <tr key={h.id} className="border-b border-zinc-100">
                <td className="py-2 font-medium">{h.name}</td>
                <td>{r?.clicks28 ?? "n/a"}</td>
                <td>{r && r.clicks28 !== null && r.clicks28Prev !== null ? `${r.clicks28 - r.clicks28Prev >= 0 ? "+" : ""}${r.clicks28 - r.clicks28Prev}` : "n/a"}</td>
                <td>{r?.clicks7 ?? "n/a"}</td>
                <td>{r && r.clicks7 !== null && r.clicks7Prev !== null ? `${r.clicks7 - r.clicks7Prev >= 0 ? "+" : ""}${r.clicks7 - r.clicks7Prev}` : "n/a"}</td>
                <td>{r ? `${r.status}, ${r.sample === "ok" ? "usable sample" : `${r.sample} sample`}` : "not generated yet"}</td>
                <td>{r ? <Link className="font-semibold text-red-800 underline" href={`/admin/house/search-reports/${h.id}`}>Open report and prompt</Link> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div>
        <h2 className="mt-4 font-semibold text-zinc-900">Top five priorities</h2>
        <ol className="list-decimal pl-5 text-zinc-700">{s.priorities.map((p, i) => <li key={i}>{p.site}: {p.title}</li>)}</ol>
      </div>
    </div>
  );
}
