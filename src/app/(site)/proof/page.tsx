import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb, businesses, publishedContent, visibilitySnapshots } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proof: we run GravyBlock on our own businesses | GravyBlock",
  description:
    "Live, verifiable results from businesses we operate ourselves on the exact same automation paying customers get. Real scores, real published content — not testimonials.",
  alternates: { canonical: "https://gravyblock.com/proof" },
};

type ShowcaseBusiness = {
  id: string;
  name: string;
  vertical: string | null;
  city: string | null;
  score: number | null;
  scoreDelta: number | null;
  articleCount: number;
  recentArticles: Array<{ title: string; publicUrl: string }>;
};

function cityFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return null;
}

async function getShowcaseBusinesses(): Promise<ShowcaseBusiness[]> {
  const db = getDb();
  if (!db) return [];

  let rows: Array<{ id: string; name: string; vertical: string | null; address: string | null }> = [];
  try {
    rows = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        vertical: businesses.vertical,
        address: businesses.address,
      })
      .from(businesses)
      .where(eq(businesses.showcaseOptIn, "true"))
      .limit(12);
  } catch {
    return []; // column may not exist yet on older DBs
  }

  // Defense in depth: the parent company never appears here (owner directive),
  // on top of the same guard in the admin toggle action.
  const visible = rows.filter((b) => !b.name.toLowerCase().includes("iscream"));
  if (!visible.length) return [];

  const ids = visible.map((b) => b.id);
  const [snapshots, articles] = await Promise.all([
    db
      .select({
        businessId: visibilitySnapshots.businessId,
        overallScore: visibilitySnapshots.overallScore,
        createdAt: visibilitySnapshots.createdAt,
      })
      .from(visibilitySnapshots)
      .where(inArray(visibilitySnapshots.businessId, ids))
      .orderBy(desc(visibilitySnapshots.createdAt))
      .limit(200),
    db
      .select({
        businessId: publishedContent.businessId,
        title: publishedContent.title,
        publicUrl: publishedContent.publicUrl,
        status: publishedContent.status,
        channel: publishedContent.channel,
        createdAt: publishedContent.createdAt,
      })
      .from(publishedContent)
      .where(inArray(publishedContent.businessId, ids))
      .orderBy(desc(publishedContent.createdAt))
      .limit(300),
  ]);

  return visible.map((b) => {
    const snaps = snapshots.filter((s) => s.businessId === b.id);
    const published = articles.filter(
      (a) => a.businessId === b.id && a.status === "published" && a.channel === "internal_site" && a.publicUrl,
    );
    const latest = snaps[0]?.overallScore ?? null;
    const previous = snaps[1]?.overallScore ?? null;
    return {
      id: b.id,
      name: b.name,
      vertical: b.vertical,
      city: cityFromAddress(b.address),
      score: latest,
      scoreDelta: latest !== null && previous !== null ? latest - previous : null,
      articleCount: published.length,
      recentArticles: published.slice(0, 3).map((a) => ({ title: a.title, publicUrl: a.publicUrl! })),
    };
  });
}

export default async function ProofPage() {
  const showcased = await getShowcaseBusinesses();

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-800">Proof, not promises</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
        We run GravyBlock on our own businesses.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-zinc-600">
        These are real businesses operated by GravyBlock&apos;s founder, running the exact same automation
        paying customers get — same plans, same worker, same schedule. The numbers below are pulled live
        from the same database that powers customer workspaces. No stock photos, no paid testimonials.
      </p>

      {showcased.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-8 text-center">
          <p className="text-sm text-zinc-600">
            We&apos;re assembling this page right now — live business data appears here as each house business
            is connected. In the meantime, the{" "}
            <Link href="/examples/sample-local-growth-report" className="font-semibold text-red-800 underline">
              sample report
            </Link>{" "}
            shows exactly what the automation produces.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {showcased.map((b) => (
            <article key={b.id} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{b.name}</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {[b.vertical, b.city].filter(Boolean).join(" · ") || "Local business"}
                  </p>
                </div>
                {b.score !== null ? (
                  <div className="shrink-0 rounded-2xl bg-zinc-50 border border-zinc-200 px-4 py-2 text-center">
                    <p className="text-2xl font-bold text-zinc-900">{b.score}</p>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500">visibility</p>
                    {b.scoreDelta !== null && b.scoreDelta !== 0 ? (
                      <p className={`text-[11px] font-semibold ${b.scoreDelta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {b.scoreDelta > 0 ? "+" : ""}{b.scoreDelta} vs last check
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-sm text-zinc-600">
                <strong className="text-zinc-900">{b.articleCount}</strong> article{b.articleCount === 1 ? "" : "s"} written
                and published automatically.
              </p>

              {b.recentArticles.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {b.recentArticles.map((a) => (
                    <li key={a.publicUrl} className="truncate text-sm">
                      <a href={a.publicUrl} className="text-red-800 underline underline-offset-2 hover:text-red-900" target="_blank" rel="noopener">
                        {a.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-zinc-900">Want the same thing running for your business?</p>
        <p className="mt-1 text-sm text-zinc-600">Start with the free 60-second scan — no account, no credit card.</p>
        <Link
          href="/scan"
          className="mt-4 inline-block rounded-full bg-red-600 px-7 py-3 text-sm font-semibold text-white hover:bg-red-500"
        >
          Get my free visibility score →
        </Link>
      </div>
    </div>
  );
}
