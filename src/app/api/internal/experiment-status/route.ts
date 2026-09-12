import { timingSafeEqual, createHmac } from "node:crypto";
import { getExperimentStatus } from "@/lib/outreach/experiment";

/** TEMPORARY, secret-gated, read-only. Verifies live persisted experiment state. Remove after use. */
function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  const provided = req.headers.get("x-admin-secret") ?? "";
  if (!expected || !provided) return false;
  const a = createHmac("sha256", "experiment-status").update(provided).digest();
  const b = createHmac("sha256", "experiment-status").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const status = await getExperimentStatus();
  return Response.json(status);
}
