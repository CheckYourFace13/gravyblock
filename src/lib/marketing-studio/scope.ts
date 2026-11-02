/**
 * Tenant isolation. Every repository function takes an OwnerScope and adds it to the query; there is no unscoped read.
 *
 *   internal scope  -> products with owner_kind 'internal' or 'house'
 *   customer scope  -> products with owner_kind 'customer' AND the same organization_id
 *
 * The scope, not the caller's input, decides ownership on create, so a customer cannot create or reach an internal
 * product, and one organization cannot reach another's.
 */
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { ms } from "./db";
import type { OwnerKind } from "./config";

export type OwnerScope = { kind: "internal" } | { kind: "customer"; organizationId: string };

export class StudioAccessError extends Error {
  constructor(message = "not found") {
    super(message);
    this.name = "StudioAccessError";
  }
}

export const INTERNAL_SCOPE: OwnerScope = { kind: "internal" };

export function customerScope(organizationId: string): OwnerScope {
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new StudioAccessError("invalid organization");
  return { kind: "customer", organizationId };
}

/** SQL predicate selecting only the products this scope may see (soft-deleted products are excluded). */
export function productVisibility(scope: OwnerScope): SQL {
  const live = isNull(ms.msProducts.deletedAt);
  if (scope.kind === "internal") {
    return and(inArray(ms.msProducts.ownerKind, ["internal", "house"]), live)!;
  }
  return and(eq(ms.msProducts.ownerKind, "customer"), eq(ms.msProducts.organizationId, scope.organizationId), live)!;
}

/** Ownership columns for a new product. Derived from the scope only. */
export function ownershipFor(scope: OwnerScope, requested?: OwnerKind): { ownerKind: OwnerKind; organizationId: string | null } {
  if (scope.kind === "customer") return { ownerKind: "customer", organizationId: scope.organizationId };
  const kind = requested === "house" ? "house" : "internal";
  return { ownerKind: kind, organizationId: null };
}
