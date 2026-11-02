/** Queue-side API for creatives: the web app only submits jobs; rendering happens in the Studio worker (pipeline.ts). */
import { and, eq, inArray } from "drizzle-orm";
import { ms, requireStudioDb, type StudioDb } from "../db";
import { requireProduct } from "../repository";
import { enqueue } from "../runtime";
import type { OwnerScope } from "../scope";
import { SIZE_KEYS, type SizeKey } from "./theme";

/** Queues a heavy render job for a concept (one active job per concept). */
export async function enqueueConceptRender(scope: OwnerScope, productId: string, conceptId: string, sizes: SizeKey[] = SIZE_KEYS, db: StudioDb = requireStudioDb()) {
  await requireProduct(scope, productId, db);
  const [concept] = await db.select().from(ms.msConcepts).where(and(eq(ms.msConcepts.id, conceptId), eq(ms.msConcepts.productId, productId))).limit(1);
  if (!concept) throw new Error("concept not found");
  const active = await db.select().from(ms.msMediaJobs).where(and(eq(ms.msMediaJobs.kind, "render_creatives"), inArray(ms.msMediaJobs.status, ["queued", "running"])));
  if (active.some((j) => (j.input as { conceptId?: string }).conceptId === conceptId)) return { id: active.find((j) => (j.input as { conceptId?: string }).conceptId === conceptId)!.id, alreadyQueued: true };
  const { id } = await enqueue({ kind: "render_creatives", weight: "heavy", priority: 4, productId, input: { conceptId, sizes } }, db);
  return { id, alreadyQueued: false };
}
