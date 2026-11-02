import { ms, type StudioDb } from "./db";

/** Append-only. There is deliberately no update or delete helper for audit rows. */
export async function audit(
  db: StudioDb,
  e: { actor: string; action: string; entity: string; entityId?: string | null; productId?: string | null; detail?: Record<string, unknown> },
): Promise<void> {
  await db.insert(ms.msAuditEvents).values({
    actor: e.actor,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    productId: e.productId ?? null,
    detail: e.detail ?? {},
  });
}
