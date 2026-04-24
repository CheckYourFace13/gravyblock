import { schedulePlanRecurringSnapshotJob, scheduleRecurringSnapshotJob } from "@/lib/autopilot/executor";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import type { PlanTier } from "@/lib/plans";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as
    | { businessId?: string; runAfterMs?: number; planTier?: string }
    | null;
  const businessId = body?.businessId?.trim();
  if (!businessId) {
    return Response.json({ error: "businessId is required" }, { status: 400 });
  }
  const rawTier = body?.planTier?.toLowerCase();
  if (rawTier === "base" || rawTier === "entry" || rawTier === "pro" || rawTier === "managed") {
    const planTier: PlanTier = rawTier === "entry" ? "base" : (rawTier as PlanTier);
    const result = await schedulePlanRecurringSnapshotJob({
      businessId,
      planTier,
    });
    return Response.json(result);
  }
  const result = await scheduleRecurringSnapshotJob({
    businessId,
    runAfterMs: body?.runAfterMs,
  });
  return Response.json(result);
}
