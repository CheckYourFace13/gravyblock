import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import { runOutreachBatch } from "@/lib/outreach/run-outreach-batch";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;

  let body: { city?: string; state?: string; industry?: string; maxEmails?: number } | null = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.city || !body?.state || !body?.industry) {
    return Response.json({ error: "city, state, and industry are required" }, { status: 400 });
  }

  const result = await runOutreachBatch({
    city: body.city,
    state: body.state,
    industry: body.industry,
    maxEmails: body.maxEmails,
  });

  return Response.json({ ok: true, ...result });
}
