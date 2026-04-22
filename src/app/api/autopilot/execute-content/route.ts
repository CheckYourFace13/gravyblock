import { executeContentPublishPath } from "@/lib/autopilot/executor";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { businessId?: string } | null;
  const businessId = body?.businessId?.trim();
  if (!businessId) {
    return Response.json({ error: "businessId is required" }, { status: 400 });
  }
  const result = await executeContentPublishPath(businessId);
  return Response.json(result);
}
