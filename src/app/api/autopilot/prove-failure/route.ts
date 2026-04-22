import { desc, eq } from "drizzle-orm";
import { executeContentPublishPath } from "@/lib/autopilot/executor";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import { getDb, publishingJobs, publishingTargets } from "@/lib/db";

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { businessId?: string } | null;
  const businessId = body?.businessId?.trim();
  if (!businessId) return Response.json({ error: "businessId is required" }, { status: 400 });
  const db = getDb();
  if (!db) return Response.json({ error: "DATABASE_URL is required" }, { status: 500 });

  await db.update(publishingTargets).set({ active: "false" }).where(eq(publishingTargets.businessId, businessId));
  const result = await executeContentPublishPath(businessId);
  await db.update(publishingTargets).set({ active: "true" }).where(eq(publishingTargets.businessId, businessId));

  const [latest] = await db
    .select({ id: publishingJobs.id, status: publishingJobs.status, responseLog: publishingJobs.responseLog })
    .from(publishingJobs)
    .orderBy(desc(publishingJobs.createdAt))
    .limit(1);

  return Response.json({
    executionResult: result,
    latestJob: latest ?? null,
    failureHandled: Boolean(latest && latest.status === "failed"),
  });
}
