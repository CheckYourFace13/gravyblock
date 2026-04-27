import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import { queueContentForBusiness } from "@/lib/content-gen/queue-content";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { businessId?: string } | null;
  const businessId = body?.businessId?.trim();

  if (!businessId) {
    return Response.json({ error: "businessId is required" }, { status: 400 });
  }

  try {
    const result = await queueContentForBusiness(businessId);
    return Response.json({ ok: true, queued: result.queued, skipped: result.skipped || undefined });
  } catch (error) {
    console.error("[api/generate-content] failed", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "content generation failed" }, { status: 500 });
  }
}
