import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { hintsFromForm, submitChanges } from "@/lib/marketing-studio/publishing/review-flow";

export const dynamic = "force-dynamic";

/** The protected half of "request changes": a plain form post (it works without JavaScript) carrying the token, the transaction and the owner's note. */
export async function POST(req: Request) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const fd = await req.formData().catch(() => null);
  const token = String(fd?.get("token") ?? "");
  const txn = String(fd?.get("txn") ?? "");
  const note = String(fd?.get("note") ?? "").slice(0, 2000);
  const hints = hintsFromForm((fd?.getAll("kind") ?? []).map(String), String(fd?.get("where") ?? ""), String(fd?.get("at") ?? ""));
  const out = await submitChanges(requireStudioDb(), { token, txn, note, hints }, process.env.MARKETING_SECRET_KEY);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com").replace(/\/$/, "");
  const back = new URL(`/video-review/${encodeURIComponent(token)}`, base);
  if (!out.ok) back.searchParams.set("e", out.message.slice(0, 200));
  return new Response(null, { status: 303, headers: { location: back.toString(), "cache-control": "no-store" } });
}
