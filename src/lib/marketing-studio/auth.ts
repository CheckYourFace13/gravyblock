/**
 * Internal authorization gate. Phase 1 is operator-only: the studio must be switched on by the master flag AND the
 * caller must hold the existing admin session. Anything else gets a 404, so the studio does not reveal that it exists.
 * Every server action calls this itself; it never relies on the page that rendered the form.
 */
import { notFound } from "next/navigation";
import { isAdminSession } from "@/lib/auth/admin-session";
import { studioEnabledByEnv } from "./config";
import { INTERNAL_SCOPE, type OwnerScope } from "./scope";

export type StudioActor = { scope: OwnerScope; actor: string };

export async function requireStudioAccess(): Promise<StudioActor> {
  if (!studioEnabledByEnv()) notFound();
  if (!(await isAdminSession())) notFound();
  return { scope: INTERNAL_SCOPE, actor: "admin" };
}
