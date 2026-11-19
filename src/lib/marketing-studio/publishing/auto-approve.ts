/**
 * Owner-only AUTO-APPROVE for the owner's OWN products (GravyBlock, its sites and games). Default OFF. Never applies to a customer: a customer product can neither store the setting
 * nor be approved by it, and a customer's videos always take the normal approval flow. When ON, an owned video is made public (the same approval the email button performs, with the
 * same publication, store and rollout rules) only after EVERY hard gate passes; when any fails nothing is published, the video is sent back to be planned and made again internally,
 * and the owner is not asked. Pure gate logic is exported for tests.
 */
import { eq } from "drizzle-orm";
import type { StudioDb } from "../db";
import { ms } from "../db";
import { audit } from "../audit";
import { updateAngle } from "../library-store";
import { listProducts } from "../repository";
import { getSetting, setSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { slotOfSpec, GRAVYBLOCK_BRIEFS } from "../gravyblock-briefs";
import { isPaused } from "./video-policy";
import { approveReview, getReview, listReviews, reviewKey } from "./video-review";

export const autoApproveKey = (productId: string) => `video_auto_approve_${productId}`;
const ACTOR = "owned-auto-approve";
type P = { id: string; ownerKind: string };
export const isOwned = (p: Pick<P, "ownerKind">) => p.ownerKind !== "customer";

/** The setting. Always false for a customer product, whatever is stored. */
export async function getAutoApprove(db: StudioDb, p: P): Promise<boolean> {
  if (!isOwned(p)) return false;
  return (await getSetting<{ on: boolean } | null>(autoApproveKey(p.id), null, db))?.on === true;
}

export async function setAutoApprove(db: StudioDb, actor: string, p: P, on: boolean): Promise<void> {
  if (!isOwned(p)) throw new Error("Auto-approve is for the owner's own products only. A customer's videos always need their own approval.");
  await setSetting(autoApproveKey(p.id), { on, by: actor, at: new Date().toISOString() }, actor, db);
  await audit(db, { actor, action: "video_review.auto_approve_setting", entity: "product", entityId: p.id, productId: p.id, detail: { on } });
}

type Check = { id: string; ok: boolean; severity?: string; detail?: string };
export type GateInput = {
  owned: boolean;
  qa: { passed?: boolean; checks?: Check[] } | null;
  kind: "demo" | "game" | "other";
  slot: string | null;
  slotPage: { ok: boolean; ms: number } | null;
  reviewStatus: string;
  paused: boolean;
};

const DEMO_REQUIRED: Array<[string, RegExp]> = [
  ["real product visuals", /^real_product_screens$/],
  ["narration matches visuals", /^visual_alignment$/],
  ["no black screen", /^no_black_screen$/],
  ["no blank screen", /^no_blank_screen$/],
  ["audible narration", /^narration_audible$/],
  ["Product Truth grounding", /^claims_use_verified_facts$/],
  ["quotes on the live pages", /^quotes_on_live_pages$/],
  ["copy and visual uniqueness", /^distinct_from_history$/],
  ["logo integrity", /^logo_/],
];

/** Pure: every hard gate. An empty list means the video may be approved automatically. */
export function autoApproveProblems(i: GateInput): string[] {
  const out: string[] = [];
  if (!i.owned) return ["not an owned product: customer videos always take the normal approval flow"];
  const checks = i.qa?.checks ?? [];
  if (!i.qa?.passed) out.push("full QA did not pass");
  for (const c of checks) if (!c.ok && (c.severity ?? "fail") === "fail") out.push(`hard check failed: ${c.id}${c.detail ? ` (${c.detail.slice(0, 80)})` : ""}`);
  const has = (re: RegExp) => checks.some((c) => re.test(c.id) && c.ok);
  if (i.kind === "demo") {
    for (const [name, re] of DEMO_REQUIRED) if (!has(re)) out.push(`required gate missing or failed: ${name}`);
  } else if (i.kind === "game") {
    if (!has(/logo_integrity$/)) out.push("required gate missing or failed: logo integrity");
    if (!checks.length) out.push("required gate missing: game QA");
  } else out.push("unknown kind of video: not eligible");
  // performance / placement QA: the page where the video would sit must load well
  if (i.slot) {
    if (!i.slotPage) out.push(`placement page for slot ${i.slot} could not be checked`);
    else if (!i.slotPage.ok) out.push(`placement page for slot ${i.slot} did not load`);
    else if (i.slotPage.ms > 3500) out.push(`placement page for slot ${i.slot} is slow (${i.slotPage.ms} ms)`);
  }
  // publication eligibility
  if (i.reviewStatus !== "unlisted_live") out.push(`not waiting for a decision (status ${i.reviewStatus})`);
  if (i.paused) out.push("video marketing is paused for this product");
  return [...new Set(out)];
}

async function timedGet(url: string): Promise<{ ok: boolean; ms: number }> {
  const t = Date.now();
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(8000), headers: { "user-agent": "GravyBlockStudioPlacementQA" } });
    await r.arrayBuffer();
    return { ok: r.ok, ms: Date.now() - t };
  } catch {
    return { ok: false, ms: Date.now() - t };
  }
}

export type AutoResult = { approved: boolean; problems: string[]; skipped?: string };

/** Approves one pending owned video if (and only if) the setting is ON and every hard gate passes. A failure sends the script back to be planned again; nobody is asked. */
export async function maybeAutoApprove(db: StudioDb, publicationId: string, log: (m: string) => void = () => {}, deps: { fetch: typeof fetch } = { fetch }): Promise<AutoResult> {
  const review = await getReview(db, publicationId);
  if (!review) return { approved: false, problems: [], skipped: "no review" };
  const product = (await listProducts(INTERNAL_SCOPE, db)).find((p) => p.id === review.productId);
  if (!product || !(await getAutoApprove(db, product))) return { approved: false, problems: [], skipped: "auto-approve is off for this product" };
  const [row] = await db.select().from(ms.msVideos).where(eq(ms.msVideos.id, review.videoRowId));
  if (!row) return { approved: false, problems: ["the video record is missing"] };
  const sb = row.storyboard as { kind?: string } | null;
  const slot = review.specId ? slotOfSpec(review.specId) : null;
  const brief = GRAVYBLOCK_BRIEFS.find((b) => slot && b.slot === slot);
  const slotPage = slot && brief ? await timedGet(new URL(brief.page, "https://gravyblock.com").toString()) : null;
  const problems = autoApproveProblems({ owned: isOwned(product), qa: row.qa as GateInput["qa"], kind: sb?.kind === "game" ? "game" : sb?.kind === "demo" ? "demo" : "other", slot, slotPage, reviewStatus: review.status, paused: await isPaused(db, product.id) });
  if (problems.length) {
    log(`auto-approve: ${review.specId ?? publicationId} held back: ${problems[0]}`);
    // a hard gate failed: nothing is published; the script is planned and made again internally (the owner is not asked)
    if (problems.some((p) => p.startsWith("hard check failed") || p.startsWith("required gate") || p === "full QA did not pass")) {
      const qa = (row.qa as { checks?: Check[] } | null) ?? {};
      await db.update(ms.msVideos).set({ status: "qa_failed", qa: { ...qa, passed: false } as never }).where(eq(ms.msVideos.id, row.id));
      await updateAngle(db, ACTOR, product.slug, (a) => a.publicationId === publicationId, { status: "blocked" });
      // this version will not be published: it is retired from the review queue (a replacement is planned and made internally), so it is not held again on every sweep
      await setSetting(reviewKey(publicationId), { ...review, status: "superseded", supersededBy: "auto-approve-replan" }, ACTOR, db);
      await audit(db, { actor: ACTOR, action: "video_review.superseded", entity: "publication", entityId: publicationId, productId: product.id, detail: { by: "auto-approve-replan" } });
    }
    await audit(db, { actor: ACTOR, action: "video_review.auto_approve_held", entity: "publication", entityId: publicationId, productId: product.id, detail: { problems: problems.slice(0, 6) } });
    return { approved: false, problems };
  }
  try {
    await approveReview(INTERNAL_SCOPE, ACTOR, publicationId, deps, db, "Approved automatically: every hard gate passed (the owner's auto-approve is on).");
    await audit(db, { actor: ACTOR, action: "video_review.auto_approved", entity: "publication", entityId: publicationId, productId: product.id, detail: { specId: review.specId ?? null } });
    log(`auto-approve: ${review.specId ?? publicationId} approved and made public`);
    return { approved: true, problems: [] };
  } catch (e) {
    // eligibility the platform itself refused (a game's store listing, rollout order, an unhealthy connection): it stays unlisted and is tried again later
    const m = e instanceof Error ? e.message : String(e);
    log(`auto-approve: ${review.specId ?? publicationId} not published yet: ${m.slice(0, 120)}`);
    return { approved: false, problems: [`publication not eligible yet: ${m.slice(0, 160)}`] };
  }
}

/** The sweep: every pending owned review is considered (a video that could not be approved right after its upload is tried again here). */
export async function autoApprovePending(db: StudioDb, log: (m: string) => void = () => {}): Promise<number> {
  let n = 0;
  for (const p of (await listProducts(INTERNAL_SCOPE, db)).filter((x) => isOwned(x))) {
    if (!(await getAutoApprove(db, p))) continue;
    for (const r of (await listReviews(db)).filter((x) => x.productId === p.id && x.status === "unlisted_live")) if ((await maybeAutoApprove(db, r.publicationId, log)).approved) n++;
  }
  return n;
}
