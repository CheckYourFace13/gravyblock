import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, proofLedger } from "@/lib/db";
import { proofCountsByCategory } from "@/lib/proof/ledger";
import { getConnectionReadiness, type EngineId } from "@/lib/onboarding/connection-readiness";

const ENGINE_LINES: Record<EngineId, string> = {
  content: "Writing and publishing articles and service pages to your website",
  seo_existing_pages: "Improving existing pages",
  gbp: "Posting to your Google Business Profile",
  social: "Posting to Facebook and Instagram",
  reviews_replies: "Monitoring reviews and replying on Google",
  review_requests: "Asking completed customers for reviews",
  authority: "Pitching local organizations for links",
  citations: "Checking your listings agree everywhere",
  competitor: "Tracking your local map rankings",
  technical: "Watching your website for problems",
  aeo: "Checking whether AI assistants mention you",
};

const CATEGORY_LABELS: Record<string, string> = {
  content: "pages published",
  ranking: "ranking changes",
  backlink: "links verified",
  gbp: "Google profile updates",
  technical: "site fixes",
  citation: "listings verified",
  review: "review actions",
  aeo: "AI visibility actions",
  social: "social posts",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export async function HomeSummary({ businessId }: { businessId: string }) {
  const readiness = await getConnectionReadiness(businessId).catch(() => null);
  const counts = await proofCountsByCategory(businessId).catch(() => ({}) as Record<string, number>);
  const recent = await (async () => {
    try {
      const db = getDb();
      if (!db) return [];
      return await db
        .select({ id: proofLedger.id, summary: proofLedger.summary, verifiedAt: proofLedger.verifiedAt, destination: proofLedger.destination })
        .from(proofLedger)
        .where(eq(proofLedger.businessId, businessId))
        .orderBy(desc(proofLedger.verifiedAt))
        .limit(3);
    } catch {
      return [];
    }
  })();

  const running = readiness?.engines.filter((e) => e.status === "running") ?? [];
  const needsYou = readiness?.needsYou ?? [];
  const countEntries = Object.entries(counts).filter(([, n]) => n > 0);
  const lastVerified = recent[0]?.verifiedAt ?? null;

  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Working for you</h2>
        {running.length ? (
          <ul className="mt-3 space-y-2 text-sm text-zinc-800">
            {running.map((e) => (
              <li key={e.engine} className="flex gap-2">
                <span className="text-emerald-600">&#10003;</span>
                <span>{ENGINE_LINES[e.engine]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Setting up. GravyBlock starts as soon as your details are confirmed.</p>
        )}
        <p className="mt-4 text-xs text-zinc-500">
          {lastVerified ? `Last verified activity: ${fmtDate(lastVerified)}` : "No verified activity yet."}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Results</h2>
        {recent.length ? (
          <>
            {countEntries.length ? (
              <p className="mt-3 text-sm font-medium text-zinc-900">
                {countEntries.map(([k, n]) => `${n} ${CATEGORY_LABELS[k] ?? k}`).join(" · ")}
              </p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm text-zinc-700">
              {recent.map((r) => (
                <li key={r.id}>
                  <span>{r.summary}</span>{" "}
                  <span className="text-xs text-zinc-500">({fmtDate(r.verifiedAt)})</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">
            Verified results appear here as soon as GravyBlock has confirmed real changes.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Needs you</h2>
        {needsYou.length ? (
          <ul className="mt-3 space-y-3 text-sm">
            {needsYou.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="font-semibold text-red-700 hover:underline">
                  {n.label}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">{n.why}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600">Nothing needs you.</p>
        )}
      </div>
    </section>
  );
}
