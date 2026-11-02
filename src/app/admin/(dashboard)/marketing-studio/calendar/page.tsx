import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { PLATFORM_SPECS } from "@/lib/marketing-studio/publishing/platforms";
import { LIVE_SETTING } from "@/lib/marketing-studio/publishing/queue";
import { listProducts } from "@/lib/marketing-studio/repository";
import { getSetting } from "@/lib/marketing-studio/runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Studio calendar", robots: { index: false, follow: false } };

const tone = (s: string) => (["published", "exported", "approved", "scheduled"].includes(s) ? "bg-emerald-100 text-emerald-800" : ["failed", "revoked", "cancelled", "deleted"].includes(s) ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800");

export default async function CalendarPage() {
  const { scope } = await requireStudioAccess();
  const db = requireStudioDb();
  const products = await listProducts(scope, db);
  const ids = products.map((p) => p.id);
  const names = new Map(products.map((p) => [p.id, p.name]));
  const pubs = ids.length ? await db.select().from(ms.msPublications).where(inArray(ms.msPublications.productId, ids)) : [];
  const campaigns = ids.length ? await db.select().from(ms.msCampaigns).where(inArray(ms.msCampaigns.productId, ids)) : [];
  const campName = new Map(campaigns.map((c) => [c.id, c.name]));
  const live = await getSetting<boolean>(LIVE_SETTING, false, db);
  void eq;
  const when = (p: (typeof pubs)[number]) => p.scheduledFor ?? p.publishedAt ?? p.createdAt;
  const sorted = [...pubs].sort((a, b) => when(a).getTime() - when(b).getTime());
  const byDay = new Map<string, typeof sorted>();
  for (const p of sorted) {
    const day = when(p).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), p]);
  }
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/marketing-studio" className="text-xs text-zinc-500 underline">
          ← Marketing Studio
        </Link>
        <Link href="/admin/marketing-studio/insights" className="ml-3 text-xs text-zinc-500 underline">
          Insights
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Content calendar</h1>
        <p className="text-sm text-zinc-600">
          Private and internal. Live posting is <strong className={live ? "text-red-700" : "text-emerald-700"}>{live ? "ON" : "OFF"}</strong>; every item needs approval first. Items without a scheduled time are shown on the day they were prepared.
        </p>
      </div>
      {byDay.size === 0 ? <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500">Nothing is planned yet.</p> : null}
      {[...byDay.entries()].map(([day, items]) => (
        <section key={day} className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-zinc-900">{day}</h2>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-zinc-500">
              <tr>
                <th className="py-1 pr-3">Time (UTC)</th>
                <th className="pr-3">Product</th>
                <th className="pr-3">Campaign</th>
                <th className="pr-3">Platform</th>
                <th className="pr-3">Creative</th>
                <th className="pr-3">Approval and state</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-zinc-100 align-top">
                  <td className="py-1.5 pr-3">{p.scheduledFor ? p.scheduledFor.toISOString().slice(11, 16) : "unscheduled"}</td>
                  <td className="pr-3">
                    <Link className="underline" href={`/admin/marketing-studio/products/${p.productId}`}>
                      {names.get(p.productId)}
                    </Link>
                  </td>
                  <td className="pr-3">{p.campaignId ? campName.get(p.campaignId) ?? "n/a" : "none"}</td>
                  <td className="pr-3">
                    {PLATFORM_SPECS[p.platform as keyof typeof PLATFORM_SPECS]?.label ?? p.platform} ({p.mode})
                  </td>
                  <td className="pr-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p.videoId ? "Video" : <img src={`/api/admin/marketing-studio/media/${p.assetId}`} alt="" className="h-12 rounded border border-zinc-200" loading="lazy" />}
                  </td>
                  <td className="pr-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${tone(p.status)}`}>{p.status.replaceAll("_", " ")}</span>
                    {p.approvedBy ? <span className="block text-zinc-500">approved by {p.approvedBy}</span> : <span className="block text-amber-700">awaiting approval</span>}
                  </td>
                  <td>
                    {p.externalUrl ? (
                      <a className="underline" href={p.externalUrl}>
                        {p.externalPostId}
                      </a>
                    ) : p.failureReason ? (
                      <span className="text-red-800">{p.failureReason}</span>
                    ) : (
                      <span className="text-zinc-400">n/a</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
