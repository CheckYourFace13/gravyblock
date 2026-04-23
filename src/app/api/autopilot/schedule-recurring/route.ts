import { schedulePlanRecurringSnapshotJob, scheduleRecurringSnapshotJob } from "@/lib/autopilot/executor";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import type { PlanTier } from "@/lib/plans";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as
    | { businessId?: string; runAfterMs?: number; planTier?: PlanTier }
    | null;
  const businessId = body?.businessId?.trim();
  if (!businessId) {
    return Response.json({ error: "businessId is required" }, { status: 400 });
  }
  if (body?.planTier === "entry" || body?.planTier === "pro" || body?.planTier === "managed") {
    const result = await schedulePlanRecurringSnapshotJob({
      businessId,
      planTier: body.planTier,
    });
    return Response.json(result);
  }
  const result = await scheduleRecurringSnapshotJob({
    businessId,
    runAfterMs: body?.runAfterMs,
  });
  return Response.json(result);
}
