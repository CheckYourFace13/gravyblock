import { desc, eq } from "drizzle-orm";
import { listConcepts, listCreatives } from "@/lib/marketing-studio/creative/copy";
import { ms, requireStudioDb } from "@/lib/marketing-studio/db";
import { getSetting } from "@/lib/marketing-studio/runtime";
import { INTERNAL_SCOPE } from "@/lib/marketing-studio/scope";
import { createVideoAction, generateConceptsAction, renderConceptAction, reviewCreativeAction, reviewVideoAction } from "../../actions";

const btn = "rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white";
const media = (assetId: string) => `/api/admin/marketing-studio/media/${assetId}`;

type Check = { id: string; ok: boolean; severity: string; detail: string };
const failures = (qa: unknown): Check[] => (((qa as { checks?: Check[] } | null)?.checks ?? []).filter((c) => !c.ok));

function QaBadge({ status }: { status: string }) {
  const tone = status === "ready_for_review" || status === "approved" ? "bg-emerald-100 text-emerald-800" : status === "qa_failed" || status === "failed" || status === "rejected" ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{status.replaceAll("_", " ")}</span>;
}

export async function CreativeSections({ productId }: { productId: string }) {
  const db = requireStudioDb();
  const [concepts, creatives, videos, videoEnabled, jobs] = await Promise.all([
    listConcepts(INTERNAL_SCOPE, productId, db),
    listCreatives(INTERNAL_SCOPE, productId, db),
    db.select().from(ms.msVideos).where(eq(ms.msVideos.productId, productId)).orderBy(desc(ms.msVideos.createdAt)),
    getSetting<boolean>("video_enabled", false, db),
    db.select().from(ms.msMediaJobs).where(eq(ms.msMediaJobs.productId, productId)).orderBy(desc(ms.msMediaJobs.createdAt)).limit(8),
  ]);
  const byConcept = new Map<string, typeof creatives>();
  for (const c of creatives) byConcept.set(c.conceptId, [...(byConcept.get(c.conceptId) ?? []), c]);

  return (
    <>
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Creative: concepts and graphics</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Copy is built only from verified Product Truth, and graphics are rendered by templates at four sizes. Each graphic is checked automatically before it can be reviewed.
              Nothing is published.
            </p>
          </div>
          <form action={generateConceptsAction}>
            <input type="hidden" name="productId" value={productId} />
            <button className={btn}>Generate concepts</button>
          </form>
        </div>

        {concepts.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No concepts yet. Verify Product Truth first, then generate.</p> : null}
        <div className="mt-4 space-y-6">
          {concepts.map((c) => {
            const items = byConcept.get(c.id) ?? [];
            const v = (c.variants ?? {}) as { headlines?: string[]; captions?: string[]; ctas?: string[] };
            return (
              <article key={c.id} className="rounded-xl border border-zinc-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">{c.family.replaceAll("_", " ")}</p>
                    <p className="font-semibold text-zinc-900">{c.headline}</p>
                    {c.subhead ? <p className="text-sm text-zinc-600">{c.subhead}</p> : null}
                    <p className="mt-2 text-sm text-zinc-800">
                      <span className="font-medium">Caption:</span> {c.caption}
                    </p>
                    {c.shortDescription ? (
                      <p className="text-xs text-zinc-600">
                        <span className="font-medium">Short description:</span> {c.shortDescription}
                      </p>
                    ) : null}
                    <p className="text-xs text-zinc-600">
                      <span className="font-medium">CTA:</span> {c.ctaText ?? "none"} {c.ctaUrl ? `(${c.ctaUrl})` : ""}
                      {v.ctas && v.ctas.length > 1 ? ` · alternatives: ${v.ctas.slice(1).join(", ")}` : ""}
                    </p>
                    {v.captions && v.captions.length > 1 ? <p className="text-xs text-zinc-500">Alternative caption: {v.captions[1]}</p> : null}
                    <p className="mt-1 text-[11px] text-zinc-500">Grounded in {(c.factIds as string[]).length} verified fact(s).</p>
                  </div>
                  <form action={renderConceptAction} className="flex items-center gap-2">
                    <input type="hidden" name="productId" value={productId} />
                    <input type="hidden" name="conceptId" value={c.id} />
                    <QaBadge status={c.status} />
                    <button className={btn}>{items.length ? "Re-render" : "Render 4 sizes"}</button>
                  </form>
                </div>
                {items.length ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {items.map((cr) => (
                      <div key={cr.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                        {cr.assetId ? (
                          <a href={media(cr.assetId)} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={media(cr.assetId)} alt={`${c.headline} ${cr.sizeKey}`} className="w-full rounded border border-zinc-200" loading="lazy" />
                          </a>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-zinc-600">
                          <span>
                            {cr.sizeKey} {cr.width}x{cr.height}
                          </span>
                          <QaBadge status={cr.status} />
                        </div>
                        {failures(cr.qa).length ? (
                          <ul className="mt-1 space-y-0.5 text-[11px] text-red-800">
                            {failures(cr.qa).map((f) => (
                              <li key={f.id}>
                                {f.severity === "warn" ? "Warning" : "Failed"}: {f.detail}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-[11px] text-emerald-700">All automated checks passed.</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          {cr.assetId ? (
                            <a className="underline" href={`${media(cr.assetId)}?download=1`}>
                              Download
                            </a>
                          ) : null}
                          {cr.status === "ready_for_review" ? (
                            <form action={reviewCreativeAction} className="flex gap-1">
                              <input type="hidden" name="productId" value={productId} />
                              <input type="hidden" name="creativeId" value={cr.id} />
                              <button name="decision" value="approved" className="rounded-full bg-emerald-700 px-2 py-0.5 font-semibold text-white">
                                Approve
                              </button>
                              <button name="decision" value="rejected" className="rounded-full border border-zinc-300 px-2 py-0.5 font-semibold text-zinc-700">
                                Reject
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Video (9:16)</h2>
        {videoEnabled ? (
          <>
            <p className="mt-1 text-sm text-zinc-600">
              Built from verified facts and approved real screenshots only, with simple motion and burned captions. Checked automatically; not published.
            </p>
            <form action={createVideoAction} className="mt-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="productId" value={productId} />
              {[15, 30, 60].map((sec) => (
                <button key={sec} name="seconds" value={sec} className={btn}>
                  Create {sec}s video
                </button>
              ))}
            </form>
          </>
        ) : (
          <p className="mt-1 text-sm text-amber-800">Video rendering is switched off until the VPS benchmark has passed and an operator enables it.</p>
        )}
        <div className="mt-4 space-y-4">
          {videos.map((vd) => (
            <div key={vd.id} className="rounded-xl border border-zinc-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-zinc-900">{vd.title}</p>
                <QaBadge status={vd.status} />
              </div>
              <p className="text-xs text-zinc-600">
                {vd.durationMs ? `${(vd.durationMs / 1000).toFixed(1)}s` : "not rendered"} · {vd.bytes ? `${(vd.bytes / 1024 / 1024).toFixed(1)} MB` : ""} {vd.renderMs ? `· rendered in ${(vd.renderMs / 1000).toFixed(0)}s` : ""}{" "}
                {vd.peakRssBytes ? `· peak memory ${(vd.peakRssBytes / 1024 / 1024).toFixed(0)} MB` : ""}
              </p>
              {vd.error ? <p className="mt-1 text-xs text-red-800">Failed: {vd.error}</p> : null}
              {failures(vd.qa).length ? (
                <ul className="mt-1 space-y-0.5 text-xs text-red-800">
                  {failures(vd.qa).map((f) => (
                    <li key={f.id}>
                      {f.severity === "warn" ? "Warning" : "Failed"}: {f.detail}
                    </li>
                  ))}
                </ul>
              ) : vd.assetId ? (
                <p className="mt-1 text-xs text-emerald-700">All automated checks passed.</p>
              ) : null}
              {vd.assetId ? (
                <div className="mt-3 flex flex-wrap items-start gap-4">
                  <video src={media(vd.assetId)} controls preload="metadata" className="max-h-[420px] rounded-lg border border-zinc-200" />
                  <div className="space-y-2 text-xs">
                    <a className="underline" href={`${media(vd.assetId)}?download=1`}>
                      Download MP4
                    </a>
                    {vd.status === "ready_for_review" ? (
                      <form action={reviewVideoAction} className="flex gap-1">
                        <input type="hidden" name="productId" value={productId} />
                        <input type="hidden" name="videoId" value={vd.id} />
                        <button name="decision" value="approved" className="rounded-full bg-emerald-700 px-3 py-1 font-semibold text-white">
                          Approve
                        </button>
                        <button name="decision" value="rejected" className="rounded-full border border-zinc-300 px-3 py-1 font-semibold text-zinc-700">
                          Reject
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {videos.length === 0 ? <p className="text-sm text-zinc-500">No videos yet.</p> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-zinc-900">Recent jobs for this product</h2>
        <ul className="mt-2 divide-y divide-zinc-100 text-xs">
          {jobs.map((j) => (
            <li key={j.id} className="py-1.5">
              <span className="font-mono">{j.kind}</span> · <QaBadge status={j.status} /> · attempt {j.attempts}/{j.maxAttempts}
              {j.wallMs ? ` · ${(j.wallMs / 1000).toFixed(1)}s` : ""}
              {j.error ? <span className="block text-red-800">Reason: {j.error}</span> : null}
            </li>
          ))}
          {jobs.length === 0 ? <li className="py-1.5 text-zinc-500">No jobs yet.</li> : null}
        </ul>
      </section>
    </>
  );
}
