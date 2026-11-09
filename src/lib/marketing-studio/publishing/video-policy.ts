/**
 * Product-level operating policy for video marketing: pause and resume, and declarations the owner makes ONCE (YouTube's made-for-kids designation).
 *   - Pause stops NEW concepts, renders and uploads for one product. It never unpublishes, never undoes an approval and keeps every setting as it was.
 *   - Resume is a deliberate dashboard action behind the GravyBlock login. It is never offered as an email link, so a scanner can never restart anything.
 *   - A declaration is stored once, per product or as a portfolio default for the owner's own products, and reused on every later upload. It is never inferred.
 */
import { and, eq, inArray } from "drizzle-orm";
import { audit } from "../audit";
import { ms, type StudioDb } from "../db";
import { getSetting, setSetting } from "../runtime";

export const policyKey = (productId: string) => `video_policy_${productId}`;
export const kidsKey = (productId: string) => `youtube_made_for_kids_${productId}`;
/** The owner's portfolio default for the iScream-owned products. Never applied to a customer product. */
export const PORTFOLIO_KIDS_KEY = "youtube_made_for_kids_portfolio";

export type VideoPolicy = {
  paused?: boolean;
  pausedAt?: string;
  pausedBy?: string;
  resumedAt?: string;
  /** Set when no strong truthful angle exists: the signature of Product Truth when it was last checked, so the next look only happens when it changes (or after a day). */
  waiting?: { since: string; truthSig: string; checkedAt: string; reason: string };
};

export const getPolicy = (db: StudioDb, productId: string) => getSetting<VideoPolicy>(policyKey(productId), {}, db);
export async function isPaused(db: StudioDb, productId: string): Promise<boolean> {
  return Boolean((await getPolicy(db, productId)).paused);
}

/** Jobs that start NEW work for a product. Queued ones are stopped by a pause; a running one is left to finish its current step safely. */
const NEW_WORK = ["library_video", "review_replacement", "render_demo_video"] as const;

export async function pauseProduct(db: StudioDb, actor: string, productId: string): Promise<{ stoppedJobs: number }> {
  const cur = await getPolicy(db, productId);
  await setSetting(policyKey(productId), { ...cur, paused: true, pausedAt: new Date().toISOString(), pausedBy: actor }, actor, db);
  const stopped = await db
    .update(ms.msMediaJobs)
    .set({ status: "cancelled", error: "paused by the owner: no new video work for this product", finishedAt: new Date() })
    .where(and(eq(ms.msMediaJobs.productId, productId), eq(ms.msMediaJobs.status, "queued"), inArray(ms.msMediaJobs.kind, [...NEW_WORK])))
    .returning({ id: ms.msMediaJobs.id });
  await audit(db, { actor, action: "video_policy.paused", entity: "product", entityId: productId, productId, detail: { stoppedJobs: stopped.length } });
  return { stoppedJobs: stopped.length };
}

export async function resumeProduct(db: StudioDb, actor: string, productId: string): Promise<void> {
  const cur = await getPolicy(db, productId);
  await setSetting(policyKey(productId), { ...cur, paused: false, resumedAt: new Date().toISOString() }, actor, db);
  await audit(db, { actor, action: "video_policy.resumed", entity: "product", entityId: productId, productId, detail: {} });
}

/** The made-for-kids declaration for a product: its own, else the owner's portfolio default (own products only). null means nobody has declared it yet. */
export async function kidsFor(db: StudioDb, product: { id: string; ownerKind?: string }): Promise<boolean | null> {
  const own = await getSetting<boolean | null>(kidsKey(product.id), null, db);
  if (typeof own === "boolean") return own;
  if (product.ownerKind === "customer") return null; // a customer declares for themselves, once, during onboarding
  const portfolio = await getSetting<boolean | null>(PORTFOLIO_KIDS_KEY, null, db);
  return typeof portfolio === "boolean" ? portfolio : null;
}

export async function declareKids(db: StudioDb, actor: string, target: { productId: string } | "portfolio", value: boolean): Promise<void> {
  await setSetting("productId" in (target as object) ? kidsKey((target as { productId: string }).productId) : PORTFOLIO_KIDS_KEY, value, actor, db);
}
