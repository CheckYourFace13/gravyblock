import type { Metadata } from "next";
import Link from "next/link";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { LIMITS, PRODUCT_KINDS } from "@/lib/marketing-studio/config";
import { getStudioDb } from "@/lib/marketing-studio/db";
import { listProducts } from "@/lib/marketing-studio/repository";
import { disableState, getSetting, readWorkerHealth, usageSummary } from "@/lib/marketing-studio/runtime";
import { listHouseAccountNames } from "@/lib/marketing-studio/house-accounts";
import { createProductAction, killSwitchAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Studio", robots: { index: false, follow: false } };

const gb = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GB`;

// Pilot presets only prefill the form. Nothing is enrolled until an operator submits it.
const PILOTS = [
  { label: "DrinkKnird (website)", name: "DrinkKnird", kind: "website" },
  { label: "RentalNoodle (SaaS)", name: "RentalNoodle", kind: "saas" },
  { label: "ScribbleZap (game)", name: "ScribbleZap", kind: "mobile_game" },
];

export default async function MarketingStudioHome({ searchParams }: { searchParams: Promise<{ e?: string; name?: string; kind?: string }> }) {
  const { scope } = await requireStudioAccess();
  const q = await searchParams;
  const db = getStudioDb();
  const dis = await disableState(db);
  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let health: Awaited<ReturnType<typeof readWorkerHealth>> | null = null;
  let usage: Record<string, number> = {};
  let kill = false;
  let dbError: string | null = null;
  if (db) {
    try {
      [products, health, usage, kill] = await Promise.all([listProducts(scope, db), readWorkerHealth(db), usageSummary(db), getSetting<boolean>("kill_switch", false, db)]);
    } catch (e) {
      dbError = e instanceof Error ? e.message : "database error";
    }
  } else {
    dbError = "MARKETING_DATABASE_URL is not configured";
  }
  const houses = await listHouseAccountNames().catch(() => []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Marketing Studio</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Private foundation (Phase 1). Off-site marketing only: it reads product information and stores plans and assets, and it never edits a
          product&apos;s website, app or game. Nothing here renders video, publishes, or calls a paid service.
        </p>
      </div>

      {q.e ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{q.e}</p> : null}
      {dbError ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Studio database unavailable: {dbError}</p> : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Studio state</p>
          <p className={`mt-2 text-lg font-semibold ${dis.disabled ? "text-red-700" : "text-emerald-700"}`}>{dis.disabled ? "Disabled" : "Enabled"}</p>
          {dis.reasons.length ? <p className="mt-1 text-xs text-zinc-600">{dis.reasons.join("; ")}</p> : null}
          <form action={killSwitchAction} className="mt-3">
            <input type="hidden" name="on" value={kill ? "0" : "1"} />
            <button className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${kill ? "bg-emerald-600" : "bg-red-700"}`}>
              {kill ? "Turn kill switch off" : "Emergency disable (kill switch)"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-zinc-500">Also stops if the file /var/lib/gravyblock-marketing/DISABLE exists, or the flag is off.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Worker</p>
          <p className={`mt-2 text-lg font-semibold ${health?.alive ? "text-emerald-700" : "text-amber-700"}`}>{health?.alive ? (health.heartbeat?.state ?? "alive") : "no recent heartbeat"}</p>
          <p className="mt-1 text-xs text-zinc-600">
            {health?.heartbeat ? `pid ${health.heartbeat.pid}, last seen ${Math.round((health.ageMs ?? 0) / 1000)}s ago` : "gravyblock-marketing-worker has not reported yet"}
          </p>
          <p className="mt-1 text-xs text-zinc-600">Queue: {health ? Object.entries(health.queue).map(([k, v]) => `${k} ${v}`).join(", ") || "empty" : "n/a"}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Storage</p>
          <p className="mt-2 text-lg font-semibold text-zinc-900">
            {health ? gb(health.usage.totalBytes) : "n/a"} <span className="text-sm font-normal text-zinc-500">of {gb(LIMITS.totalDiskCeilingBytes)} ceiling</span>
          </p>
          <p className="mt-1 text-xs text-zinc-600">{health ? `${gb(health.disk.freeBytes)} free on the volume (floor ${gb(LIMITS.freeDiskFloorBytes)})` : ""}</p>
          <p className="mt-1 text-xs text-zinc-600">Jobs run this month: {usage.jobs_run ?? 0}. Paid usage: $0 (no paid services are enabled).</p>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Products</h2>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No products enrolled. Nothing is enrolled automatically.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {products.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/admin/marketing-studio/products/${p.id}`} className="font-medium text-red-800 underline">
                  {p.name}
                </Link>
                <span className="text-xs text-zinc-500">
                  {p.kind.replace("_", " ")} · {p.ownerKind} · {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Add a product</h2>
        <p className="mt-1 text-xs text-zinc-600">
          Pilot presets (prefill only, nothing is enrolled until you submit):{" "}
          {PILOTS.map((p, i) => (
            <span key={p.name}>
              {i > 0 ? " · " : ""}
              <Link className="underline" href={`/admin/marketing-studio?name=${encodeURIComponent(p.name)}&kind=${p.kind}`}>
                {p.label}
              </Link>
            </span>
          ))}
        </p>
        <form action={createProductAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <input name="name" required defaultValue={q.name ?? ""} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Type
            <select name="kind" defaultValue={q.kind ?? "website"} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {PRODUCT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Public URL (read-only reference)
            <input name="publicUrl" placeholder="https://" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          </label>
          <label className="text-sm">
            Ownership
            <select name="ownerKind" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              <option value="internal">Internal product</option>
              <option value="house">House Account product</option>
            </select>
          </label>
          <label className="text-sm sm:col-span-2">
            Linked House Account (optional, read-only reference)
            <select name="businessId" className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              <option value="">None</option>
              {houses.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white">Add product</button>
          </div>
        </form>
      </section>
    </div>
  );
}
