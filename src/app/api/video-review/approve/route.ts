import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { submitApproval } from "@/lib/marketing-studio/publishing/review-flow";

export const dynamic = "force-dynamic";

/** The protected half of the one-click approval. Needs the signed review token AND the transaction the opened page was given; nothing else works. */
export async function POST(req: Request) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; txn?: unknown };
  if (typeof body.token !== "string" || typeof body.txn !== "string") return Response.json({ ok: false, message: "Missing review details." }, { status: 400 });
  const out = await submitApproval(requireStudioDb(), { fetch }, { token: body.token, txn: body.txn }, process.env.MARKETING_SECRET_KEY);
  return Response.json(out.ok ? out : { ok: false, message: out.message }, { status: out.ok ? 200 : out.status, headers: { "cache-control": "no-store" } });
}
