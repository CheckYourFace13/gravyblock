import { runPendingRecurringSnapshotJobs } from "@/lib/autopilot/executor";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { limit?: number } | null;
  const result = await runPendingRecurringSnapshotJobs(body?.limit ?? 10);
  return Response.json(result);
}
