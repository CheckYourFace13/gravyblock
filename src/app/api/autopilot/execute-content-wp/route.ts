import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { marked } from "marked";
import { verifyAutopilotOperatorRequest } from "@/lib/autopilot/operator-auth";
import { getDb, businesses, contentQueue, publishedContent, publishingJobs, publishingTargets } from "@/lib/db";
import { generateArticleBody, generateLocalPageBody } from "@/lib/content/generator";
import { extractWordPressConfig, publishToWordPress } from "@/lib/publishing/adapters/wordpress";

function cityFromAddress(address: string | null | undefined): string {
  if (!address) return "your area";
  const parts = address.split(",");
  if (parts.length >= 2) return parts[1].trim();
  return address.trim();
}

export async function POST(req: Request) {
  const denied = verifyAutopilotOperatorRequest(req);
  if (denied) return denied;

  const body = (await req.json().catch(() => null)) as { businessId?: string } | null;
  const businessId = body?.businessId?.trim();
  if (!businessId) return Response.json({ error: "businessId is required" }, { status: 400 });

  const db = getDb();
  if (!db) return Response.json({ error: "Database not configured" }, { status: 503 });

  // Next queued item for this business
  const [queuedItem] = await db
    .select()
    .from(contentQueue)
    .where(and(eq(contentQueue.businessId, businessId), eq(contentQueue.status, "queued")))
    .orderBy(contentQueue.createdAt)
    .limit(1);

  if (!queuedItem) return Response.json({ ok: false, reason: "no_queued_content" });

  // Active WordPress publishing target
  const [target] = await db
    .select()
    .from(publishingTargets)
    .where(
      and(
        eq(publishingTargets.businessId, businessId),
        eq(publishingTargets.active, "true"),
        eq(publishingTargets.adapter, "wordpress"),
      ),
    )
    .limit(1);

  if (!target) return Response.json({ ok: false, reason: "no_wordpress_target" });

  const wpConfig = extractWordPressConfig(target.config);
  if (!wpConfig) return Response.json({ ok: false, reason: "incomplete_wordpress_config" });

  // Load business context for content generation
  const [biz] = await db
    .select({ name: businesses.name, vertical: businesses.vertical, address: businesses.address })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  const genParams = {
    businessName: biz?.name ?? "Local business",
    city: cityFromAddress(biz?.address),
    vertical: biz?.vertical ?? null,
    title: queuedItem.title,
    outline: queuedItem.outline ?? "",
    targetKeyword: queuedItem.targetKeyword ?? null,
    address: biz?.address ?? null,
  };

  const aiMarkdown =
    queuedItem.kind === "location_page"
      ? await generateLocalPageBody(genParams)
      : await generateArticleBody(genParams);

  const markdownBody = aiMarkdown ?? `# ${queuedItem.title}\n\n${queuedItem.outline ?? ""}`;
  const htmlBody = marked.parse(markdownBody) as string;

  // Create publish job record
  const publishJobId = randomUUID();
  await db.insert(publishingJobs).values({
    id: publishJobId,
    queueId: queuedItem.id,
    targetId: target.id,
    status: "pending",
    responseLog: "WordPress publish attempt started.",
  });

  const result = await publishToWordPress(wpConfig, { title: queuedItem.title, content: htmlBody });

  if (!result.ok) {
    await db.update(contentQueue).set({ status: "failed" }).where(eq(contentQueue.id, queuedItem.id));
    await db
      .update(publishingJobs)
      .set({ status: "failed", responseLog: result.error })
      .where(eq(publishingJobs.id, publishJobId));
    return Response.json({ ok: false, reason: "publish_failed", error: result.error });
  }

  const artifactId = randomUUID();
  await db.insert(publishedContent).values({
    id: artifactId,
    businessId,
    locationId: queuedItem.locationId ?? null,
    queueId: queuedItem.id,
    title: queuedItem.title,
    body: markdownBody,
    channel: "wordpress",
    publicUrl: result.postUrl,
    status: "published",
  });

  await db.update(contentQueue).set({ status: "published" }).where(eq(contentQueue.id, queuedItem.id));
  await db
    .update(publishingJobs)
    .set({ status: "published", responseLog: `Published to ${result.postUrl}` })
    .where(eq(publishingJobs.id, publishJobId));

  return Response.json({ ok: true, publishJobId, postUrl: result.postUrl, artifactId });
}
