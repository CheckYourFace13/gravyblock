/**
 * Video production targets, set by the owner (or a customer) on the product page. A target is the number of distinct, approved-quality videos a product should have: GravyBlock keeps
 * making them by itself, one at a time, until the number is reached or the owner pauses. Nothing here needs a person at a terminal. The owner's own portfolio uses owner-defined targets
 * (the default is five); a customer's target still never runs ahead of their plan's allowance, which the loop enforces separately.
 * A change request is a correction of a video that already counts, so it never reduces the remaining target and never uses allowance.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { ms, type StudioDb } from "./db";
import type { AngleEntry } from "./library";
import { getAngles } from "./library-store";
import { OWNED_TARGET, TARGET_EXEMPT } from "./portfolio-target";
import { getSetting, setSetting } from "./runtime";

export const PRESET_TARGETS = [1, 3, 5] as const;
export const MAX_TARGET = 50;
export const targetKey = (productId: string) => `video_target_${productId}`;

export type StoredTarget = { target: number; setBy: string; setAt: string };
export type TargetProduct = { id: string; slug: string; kind?: string; ownerKind: string };

/** A game is made by the game video engine, never the product-demo storyteller. */
export const isGame = (p: { kind?: string }) => p.kind === "mobile_game" || p.kind === "game";

/** The target a product has until someone sets one: five for the owner's own products and games, none (the plan's pace decides) for a customer. */
export const defaultTarget = (p: Pick<TargetProduct, "ownerKind" | "slug">): number | null => (p.ownerKind !== "customer" && !TARGET_EXEMPT.has(p.slug) ? OWNED_TARGET : null);

export const cleanTarget = (n: unknown): number | null => {
  const v = typeof n === "number" ? n : Number(String(n ?? "").trim());
  return Number.isInteger(v) && v >= 1 && v <= MAX_TARGET ? v : null;
};

export async function getTarget(db: StudioDb, p: TargetProduct): Promise<{ target: number | null; explicit: boolean }> {
  const s = await getSetting<StoredTarget | null>(targetKey(p.id), null, db);
  const t = cleanTarget(s?.target);
  return t ? { target: t, explicit: true } : { target: defaultTarget(p), explicit: false };
}

export async function setTarget(db: StudioDb, actor: string, productId: string, n: unknown): Promise<number> {
  const t = cleanTarget(n);
  if (!t) throw new Error(`A video target is a whole number from 1 to ${MAX_TARGET}.`);
  await setSetting(targetKey(productId), { target: t, setBy: actor, setAt: new Date().toISOString() } satisfies StoredTarget, actor, db, { audited: true });
  return t;
}

export type TargetStats = {
  target: number | null;
  /** approved by the owner or public */
  approved: number;
  /** uploaded and waiting for the owner's decision */
  waiting: number;
  /** being made right now (queued or rendering) */
  making: number;
  /** how many more distinct videos are still wanted; null when no target is set */
  remaining: number | null;
};

/** Pure: how far a product is toward its target. Corrections to a video that already counts never change these numbers. */
export function statsFrom(angles: Array<Pick<AngleEntry, "status">>, activeJobs: number, target: number | null): TargetStats {
  const approved = angles.filter((a) => a.status === "public" || a.status === "approved").length;
  const waiting = angles.filter((a) => a.status === "unlisted_review" || a.status === "ready_for_review").length;
  const making = Math.max(angles.filter((a) => a.status === "in_production").length, activeJobs);
  return { target, approved, waiting, making, remaining: target === null ? null : Math.max(0, target - approved - waiting - making) };
}

export async function activeProductionJobs(db: StudioDb, productId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.productId, productId), inArray(ms.msMediaJobs.kind, ["library_video", "game_video"]), inArray(ms.msMediaJobs.status, ["queued", "running"])));
  return row?.n ?? 0;
}

export async function targetStats(db: StudioDb, p: TargetProduct): Promise<TargetStats> {
  const { target } = await getTarget(db, p);
  return statsFrom(await getAngles(db, p.slug), await activeProductionJobs(db, p.id), target);
}

// ---- maximum pending reviews --------------------------------------------------------------------------------------------------------------------

/**
 * How many videos may be waiting for the owner's decision at once before production pauses. Production does NOT stop at the first video waiting: it keeps going, one heavy render at a time,
 * emailing each, until this many are pending (or the target is reached). The owner's own portfolio defaults to five per product or game; a customer's default follows their plan's cadence.
 */
export const maxPendingKey = (productId: string) => `video_max_pending_${productId}`;
export const OWNED_MAX_PENDING = 5;
export const CUSTOMER_MAX_PENDING_CAP = 3;
export const MAX_PENDING_LIMIT = 20;

export const defaultMaxPending = (p: Pick<TargetProduct, "ownerKind">): number => (p.ownerKind !== "customer" ? OWNED_MAX_PENDING : 1);

export const cleanMaxPending = (n: unknown, p: Pick<TargetProduct, "ownerKind">): number | null => {
  const v = typeof n === "number" ? n : Number(String(n ?? "").trim());
  if (!Number.isInteger(v) || v < 1 || v > MAX_PENDING_LIMIT) return null;
  return p.ownerKind === "customer" ? Math.min(v, CUSTOMER_MAX_PENDING_CAP) : v;
};

export async function getMaxPending(db: StudioDb, p: TargetProduct): Promise<{ max: number; explicit: boolean }> {
  const s = await getSetting<{ max: number } | null>(maxPendingKey(p.id), null, db);
  const v = cleanMaxPending(s?.max, p);
  return v ? { max: v, explicit: true } : { max: defaultMaxPending(p), explicit: false };
}

export async function setMaxPending(db: StudioDb, actor: string, p: TargetProduct, n: unknown): Promise<number> {
  const v = cleanMaxPending(n, p);
  if (!v) throw new Error(`Maximum pending reviews is a whole number from 1 to ${MAX_PENDING_LIMIT}.`);
  await setSetting(maxPendingKey(p.id), { max: v, setBy: actor, setAt: new Date().toISOString() }, actor, db, { audited: true });
  return v;
}

/** Videos waiting for the owner: uploaded for review, or with changes requested (the correction is still the same video). */
export const pendingCount = (reviews: Array<{ status: string }>) => reviews.filter((r) => r.status === "unlisted_live" || r.status === "changes_requested").length;
