import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { sendNoticeEmail, sendReviewEmail, sendTestReviewEmail, TEST_PUBLICATION_ID, verifyNotifySignature } from "@/lib/marketing-studio/publishing/review-notify";

export const dynamic = "force-dynamic";

/** Called by the Studio CLI on this server. Signed with the shared Studio secret and carrying only a publication id; the recipient is fixed to the owner. */
export async function POST(req: Request) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const body = (await req.json().catch(() => ({}))) as { publicationId?: unknown; notice?: unknown; test?: unknown };
  const id = typeof body.publicationId === "string" && /^[0-9a-f-]{36}$/i.test(body.publicationId) ? body.publicationId : "";
  if (!id || !verifyNotifySignature(id, req.headers.get("x-studio-ts"), req.headers.get("x-studio-sig"), process.env.MARKETING_SECRET_KEY)) return notFoundResponse();
  if (body.test === true) {
    if (id !== TEST_PUBLICATION_ID) return notFoundResponse();
    const t = await sendTestReviewEmail(requireStudioDb());
    return Response.json(t, { status: t.sent ? 200 : 409 });
  }
  const out = body.notice === true ? await sendNoticeEmail(requireStudioDb(), id) : await sendReviewEmail(requireStudioDb(), id);
  return Response.json(out, { status: out.sent ? 200 : 409 });
}
