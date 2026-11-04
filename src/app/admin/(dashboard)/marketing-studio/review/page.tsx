import type { Metadata } from "next";
import Link from "next/link";
import { requireStudioAccess } from "@/lib/marketing-studio/auth";
import { loadReview, REPRESENTATIVE_COUNT, type FactRef, type ReviewCreative, type ReviewProduct, type ReviewVideo } from "@/lib/marketing-studio/review";
import { reviewDecisionAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing Studio review", robots: { index: false, follow: false } };

const media = (assetId: string) => `/api/admin/marketing-studio/media/${assetId}`;

function Badge({ status }: { status: string }) {
  const tone =
    status === "approved" ? "bg-emerald-100 text-emerald-800" : status === "ready_for_review" ? "bg-sky-100 text-sky-800" : status === "rejected" || status === "qa_failed" || status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  const label = status === "ready_for_review" ? "awaiting your review" : status.replaceAll("_", " ");
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{label}</span>;
}

function QaLine({ qa }: { qa: { passed: boolean; checks: number; failed: Array<{ id: string; detail: string; severity: string }> } }) {
  return (
    <div className="text-[11px]">
      <p className={qa.passed ? "font-semibold text-emerald-700" : "font-semibold text-red-800"}>
        QA {qa.passed ? "passed" : "FAILED"} ({qa.checks} automated checks)
      </p>
      {qa.failed.map((f) => (
        <p key={f.id} className={f.severity === "warn" ? "text-amber-800" : "text-red-800"}>
          {f.severity === "warn" ? "Warning" : "Failed"}: {f.detail}
        </p>
      ))}
    </div>
  );
}

function Facts({ facts, empty }: { facts: FactRef[]; empty: string }) {
  if (!facts.length) return <p className="text-[11px] text-amber-800">{empty}</p>;
  return (
    <ul className="space-y-1 text-[11px] text-zinc-700">
      {facts.map((f) => (
        <li key={f.id}>
          <span className="font-semibold">{f.key.replaceAll("_", " ")}:</span> {f.value.length > 160 ? `${f.value.slice(0, 160)}...` : f.value}
          <span className={`block ${f.verified ? "text-zinc-500" : "text-red-800"}`}>
            {f.sourceKind.replaceAll("_", " ")}
            {f.sourceUrl ? ` · ${f.sourceUrl}` : ""} · {f.verified ? "verified" : "NOT verified"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Decision({ kind, id, productId, back, status, qaPassed }: { kind: "creative" | "video"; id: string; productId: string; back: string; status: string; qaPassed: boolean }) {
  const canApprove = qaPassed && status !== "approved";
  return (
    <form action={reviewDecisionAction} className="mt-2 flex flex-wrap gap-1.5">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="back" value={back} />
      <button name="decision" value="approved" disabled={!canApprove} className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">
        Approve
      </button>
      <button name="decision" value="rejected" disabled={status === "rejected"} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-800 disabled:opacity-40">
        Reject
      </button>
      <button name="decision" value="regenerate_later" disabled={status === "regenerate_later"} className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-800 disabled:opacity-40">
        Regenerate later
      </button>
    </form>
  );
}

function CreativeCard({ c, productId, back }: { c: ReviewCreative; productId: string; back: string }) {
  return (
    <article className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-3">
      {c.assetId ? (
        <a href={media(c.assetId)} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media(c.assetId)} alt={c.headline} width={c.width} height={c.height} className="w-full rounded-lg border border-zinc-200 bg-zinc-100" loading="lazy" />
        </a>
      ) : (
        <p className="rounded-lg bg-red-50 p-6 text-center text-xs text-red-800">No image was stored for this creative.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge status={c.status} />
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">{c.family.replaceAll("_", " ")}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
          {c.sizeKey} · {c.width}x{c.height} · {c.aspect}
        </span>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Campaign: {c.campaign ?? "none yet"}</p>
      <h3 className="mt-1 font-semibold text-zinc-900">{c.headline}</h3>
      {c.subhead ? <p className="text-sm text-zinc-700">{c.subhead}</p> : null}
      <p className="mt-2 text-sm text-zinc-800">
        <span className="font-medium">Caption:</span> {c.caption}
      </p>
      <p className="mt-1 text-sm text-zinc-800">
        <span className="font-medium">CTA:</span> {c.ctaText ?? "none"}
        {c.ctaUrl ? <span className="block break-all text-xs text-zinc-500">{c.ctaUrl}</span> : null}
      </p>
      <div className="mt-2 rounded-lg bg-zinc-50 p-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Product Truth used ({c.facts.length})</p>
        <Facts facts={c.facts} empty="No Product Truth fact is linked to this concept. Do not approve it." />
      </div>
      <div className="mt-2">
        <QaLine qa={c.qa} />
      </div>
      <div className="mt-auto">
        <Decision kind="creative" id={c.creativeId} productId={productId} back={back} status={c.status} qaPassed={c.qa.passed && Boolean(c.assetId)} />
      </div>
    </article>
  );
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}.${String(Math.floor((ms % 1000) / 100))}`;

/** The owner's view of a product demo: the video, what is said, what happens scene by scene, and the source behind every claim. */
function DemoVideoCard({ v, productId, back }: { v: ReviewVideo; productId: string; back: string }) {
  const d = v.demo!;
  const label = v.status === "ready_for_review" ? "READY_FOR_OWNER_REVIEW" : v.status === "approved" ? "APPROVED" : v.status.toUpperCase();
  const failed = v.qaChecks.filter((c) => !c.ok);
  return (
    <article className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="grid gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
        <div>
          {v.assetId ? (
            // No autoplay and no loop: the owner presses play.
            <video src={media(v.assetId)} controls preload="metadata" playsInline className="w-full rounded-lg border border-zinc-200 bg-black" />
          ) : (
            <p className="rounded-lg bg-red-50 p-6 text-center text-xs text-red-800">No video file was stored.</p>
          )}
          <Decision kind="video" id={v.videoId} productId={productId} back={back} status={v.status} qaPassed={v.qa.passed && Boolean(v.assetId)} />
          <p className="mt-2 text-[11px] text-zinc-500">Approving only records your decision. Nothing is published, scheduled or connected, and no other video is made until you decide.</p>
        </div>
        <div className="min-w-0 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${v.status === "approved" ? "bg-emerald-100 text-emerald-800" : v.status === "ready_for_review" ? "bg-sky-100 text-sky-800" : "bg-red-100 text-red-800"}`}>{label}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">{d.classification.replaceAll("_", " ")}</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">{v.durationSec ?? "?"} seconds</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
              {v.width ?? "?"}x{v.height ?? "?"} · 30 fps
            </span>
          </div>
          <h3 className="text-base font-semibold text-zinc-900">{d.title}</h3>
          <p>
            <span className="font-medium">CTA:</span> {d.cta.text} <span className="break-all text-xs text-zinc-500">{d.cta.url}</span>
          </p>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Audio</p>
            <p className="mt-1 text-xs text-zinc-800">
              <span className="font-semibold">Voiceover:</span> {d.audio.voiceover.engine}, voice {d.audio.voiceover.voice}, speed {d.audio.voiceover.speed}. Model {d.audio.voiceover.model}. License: {d.audio.voiceover.license}. Cost: {d.audio.voiceover.cost}.
            </p>
            <p className="mt-1 text-xs text-zinc-800">
              <span className="font-semibold">Music:</span> {d.audio.music.source}. License: {d.audio.music.license}. Cost: {d.audio.music.cost}.
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Quality checks ({v.qaChecks.filter((c) => c.ok).length} of {v.qaChecks.length} passed)</p>
            {failed.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-red-800">
                {failed.map((c) => (
                  <li key={c.id}>
                    {c.severity === "warn" ? "Warning" : "FAILED"} {c.id}: {c.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs font-semibold text-emerald-700">Every automated check passed.</p>
            )}
          </div>
        </div>
      </div>

      <section>
        <h4 className="text-sm font-semibold text-zinc-900">Voiceover transcript</h4>
        <ol className="mt-2 space-y-1.5 text-sm">
          {d.transcript.map((t) => (
            <li key={t.id} className="flex gap-3">
              <span className="w-24 shrink-0 font-mono text-[11px] text-zinc-500">
                {mmss(t.startMs)} to {mmss(t.endMs)}
              </span>
              <span className="text-zinc-900">{t.text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[11px] text-zinc-500">Captions are on screen word by word with the voice. Word timing inside a line is estimated from the line&apos;s measured audio length; line starts and ends are exact.</p>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-zinc-900">Scene by scene</h4>
        <ol className="mt-2 space-y-3">
          {d.scenes.map((s, i) => (
            <li key={s.id} className="rounded-xl border border-zinc-200 p-3 text-sm">
              <p className="font-semibold text-zinc-900">
                {i + 1}. {s.headline ?? s.id} <span className="font-mono text-[11px] font-normal text-zinc-500">{mmss(s.startMs)} to {mmss(s.endMs)}</span>
              </p>
              <p className="text-zinc-700">{s.purpose}</p>
              <p className="mt-1 text-xs text-zinc-700">
                <span className="font-semibold">Motion:</span> {s.motion.join("; ")}.
              </p>
              {s.sourceVisual ? (
                <div className="mt-1 text-xs text-zinc-700">
                  <p>
                    <span className="font-semibold">Source visual:</span>{" "}
                    <a href={s.sourceVisual.url} target="_blank" rel="noreferrer noopener" className="break-all underline">
                      {s.sourceVisual.url}
                    </a>{" "}
                    <span className="text-zinc-500">captured {s.sourceVisual.capturedAt.slice(0, 16).replace("T", " ")} UTC</span>
                  </p>
                  <p className="text-zinc-600">{s.sourceVisual.note}</p>
                  {s.sourceVisual.states.length > 1 ? <p className="text-zinc-500">Real states captured: {s.sourceVisual.states.join(" | ")}</p> : null}
                </div>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">No product screen is claimed in this scene.</p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h4 className="text-sm font-semibold text-zinc-900">Source for every product claim</h4>
        <ul className="mt-2 space-y-2 text-sm">
          {d.claims.map((c) => (
            <li key={c.id} className="rounded-xl border border-zinc-200 p-3">
              <p className="text-zinc-900">{c.text}</p>
              <p className={`text-[11px] ${c.factsVerified && c.factIds.length ? "text-emerald-700" : "text-red-800"}`}>{c.factIds.length} verified Product Truth fact(s) {c.factsVerified ? "back this claim" : "are missing or unverified"}</p>
              <ul className="mt-1 space-y-0.5 text-xs text-zinc-700">
                {c.sources.map((s, k) => (
                  <li key={k}>
                    <span className={s.onPage ? "text-emerald-700" : "text-red-800"}>{s.onPage ? "Found on page" : "NOT FOUND on page"}</span>: &quot;{s.quote}&quot;{" "}
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="break-all text-zinc-500 underline">
                      {s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-zinc-500">On-screen text and the claim behind it</p>
        <ul className="mt-1 grid gap-x-6 text-xs text-zinc-700 sm:grid-cols-2">
          {d.onScreen.map((o, i) => (
            <li key={i}>
              {o.kind}: &quot;{o.text}&quot; <span className="text-zinc-500">({o.claim})</span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

function VideoCard({ v, productId, back }: { v: ReviewVideo; productId: string; back: string }) {
  if (v.demo) return <DemoVideoCard v={v} productId={productId} back={back} />;
  return (
    <article className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-[minmax(0,320px)_1fr]">
      <div>
        {v.assetId ? (
          // No autoplay and no loop: the owner presses play. preload=metadata fetches only enough to show the first frame and length.
          <video src={media(v.assetId)} controls preload="metadata" playsInline className="w-full rounded-lg border border-zinc-200 bg-black" />
        ) : (
          <p className="rounded-lg bg-red-50 p-6 text-center text-xs text-red-800">No video file was stored.</p>
        )}
        <Decision kind="video" id={v.videoId} productId={productId} back={back} status={v.status} qaPassed={v.qa.passed && Boolean(v.assetId)} />
      </div>
      <div className="min-w-0 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge status={v.status} />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">{v.durationSec ?? "?"} seconds</span>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700">
            {v.width ?? "?"}x{v.height ?? "?"}
          </span>
        </div>
        <h3 className="font-semibold text-zinc-900">{v.title}</h3>
        {v.postCaption ? (
          <p>
            <span className="font-medium">Post caption:</span> <span className="whitespace-pre-line">{v.postCaption}</span>
          </p>
        ) : null}
        <p>
          <span className="font-medium">On-screen captions:</span> {v.captions.length ? v.captions.join(" / ") : "none (the title and feature cards carry the text)"}
        </p>
        {v.endCard ? (
          <p>
            <span className="font-medium">End card:</span> {v.endCard.headline}
            <span className="block">
              <span className="font-medium">CTA:</span> {v.endCard.ctaText ?? "none"}
              {v.endCard.ctaUrl ? <span className="ml-1 break-all text-xs text-zinc-500">{v.endCard.ctaUrl}</span> : null}
            </span>
          </p>
        ) : (
          <p className="text-red-800">This video has no call to action end card.</p>
        )}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Scenes</p>
          <ol className="list-decimal pl-5 text-xs text-zinc-700">
            {v.scenes.map((s, i) => (
              <li key={i}>
                {s.kind === "card" ? "Card" : "Real image"} · {s.seconds}s · {s.text}
                {s.detail ? <span className="text-zinc-500"> ({s.detail})</span> : null}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Source assets ({v.sources.length})</p>
          <ul className="space-y-2 text-xs text-zinc-700">
            {v.sources.map((a) => (
              <li key={a.assetId} className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media(a.assetId)} alt={a.name} className="h-10 w-10 rounded border border-zinc-200 object-cover" loading="lazy" />
                <span>
                  {a.name} <span className="text-zinc-500">· {a.kind} · {a.provenance.replaceAll("_", " ")}</span>
                  {a.sourceUrl ? <span className="block break-all text-zinc-500">{a.sourceUrl}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-zinc-50 p-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">Product Truth used ({v.facts.length})</p>
          <Facts facts={v.facts} empty="No verified fact matches the on-screen text. Check this video before approving it." />
        </div>
        <QaLine qa={v.qa} />
      </div>
    </article>
  );
}

function ProductSection({ p, showAll, back }: { p: ReviewProduct; showAll: boolean; back: string }) {
  const own = `/admin/marketing-studio/review`;
  const concepts = new Map<string, ReviewCreative[]>();
  for (const c of p.all) concepts.set(c.conceptId, [...(concepts.get(c.conceptId) ?? []), c]);
  return (
    <section id={p.slug} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-200 pb-2">
        <h2 className="text-xl font-semibold text-zinc-900">
          {p.name} <span className="text-sm font-normal text-zinc-500">({p.kind.replaceAll("_", " ")})</span>
        </h2>
        <p className="text-xs text-zinc-600">
          {showAll ? `All ${p.totalCreatives} images` : `${p.representatives.length} of ${p.totalCreatives} images`} ·{" "}
          {showAll ? (
            <Link href={own} className="font-semibold underline">
              Show best only
            </Link>
          ) : (
            <Link href={`${own}?all=${p.slug}`} className="font-semibold underline">
              View all {p.totalCreatives}
            </Link>
          )}
        </p>
      </div>

      {p.representatives.length === 0 ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No creative has passed every automated check for this product yet.</p> : null}
      {!showAll ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {p.representatives.map((c) => (
            <CreativeCard key={c.creativeId} c={c} productId={p.productId} back={back} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {[...concepts.values()].map((items) => (
            <div key={items[0].conceptId} className="space-y-2">
              <p className="text-sm font-semibold text-zinc-900">
                {items[0].family.replaceAll("_", " ")}: {items[0].headline}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {items.map((c) => (
                  <CreativeCard key={c.creativeId} c={c} productId={p.productId} back={back} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="pt-2 text-lg font-semibold text-zinc-900">Pilot video</h3>
      {p.video ? <VideoCard v={p.video} productId={p.productId} back={back} /> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{p.videoNote ?? "No video has been rendered for this product."}</p>}
      {p.otherVideos ? <p className="text-xs text-zinc-500">{p.otherVideos} older or alternative video(s) exist for this product and are not shown here.</p> : null}
    </section>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ all?: string; e?: string }> }) {
  const { scope } = await requireStudioAccess();
  const q = await searchParams;
  let review: ReviewProduct[] = [];
  let error: string | null = null;
  try {
    review = await loadReview(scope);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not load the review";
  }
  const allParam = q.all && /^[a-z0-9-]{1,40}$/.test(q.all) ? q.all : "";
  const back = `/admin/marketing-studio/review${allParam ? `?all=${allParam}` : ""}`;
  const approved = review.reduce((n, p) => n + p.all.filter((c) => c.status === "approved").length + (p.video?.status === "approved" ? 1 : 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/marketing-studio" className="text-xs text-zinc-500 underline">
          ← Marketing Studio
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Marketing Studio → Review</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          The real generated output for the three pilots: the best {REPRESENTATIVE_COUNT}{" "}
          images per product (one per concept, different angles first) and the RentalNoodle pilot demo video (other video generation is frozen until you approve it). Approving, rejecting or
          marking &quot;regenerate later&quot; only records your decision. <strong>Nothing is published, scheduled or connected from this screen.</strong>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <a href="/api/admin/marketing-studio/review-bundle" className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white">
            Download private review bundle (.zip)
          </a>
          <span className="text-xs text-zinc-500">12 images, the RentalNoodle demo video and an index.html with captions, CTAs, the voiceover transcript and the source of every claim. Owner only.</span>
          <span className="text-xs text-zinc-500">Approved so far: {approved}</span>
          {allParam ? null : (
            <Link href="/admin/marketing-studio/review?all=1" className="text-xs font-semibold underline">
              View all images for every product
            </Link>
          )}
        </div>
        <nav className="mt-3 flex flex-wrap gap-2 text-xs">
          {review.map((p) => (
            <a key={p.slug} href={`#${p.slug}`} className="rounded-full border border-zinc-300 px-3 py-1 font-semibold text-zinc-800">
              {p.name}
            </a>
          ))}
        </nav>
      </div>

      {q.e ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{q.e}</p> : null}
      {error ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Could not load: {error}</p> : null}
      {!error && review.length === 0 ? <p className="text-sm text-zinc-600">The pilot products have not been created yet.</p> : null}

      {review.map((p) => (
        <ProductSection key={p.slug} p={p} showAll={allParam === "1" || allParam === p.slug} back={back} />
      ))}
    </div>
  );
}
