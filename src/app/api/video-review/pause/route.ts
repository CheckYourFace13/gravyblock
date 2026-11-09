import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { submitPause } from "@/lib/marketing-studio/publishing/review-flow";

export const dynamic = "force-dynamic";

/** The protected half of "pause new videos": a plain form post carrying the signed token and the one-use transaction the opened page was given. */
export async function POST(req: Request) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const fd = await req.formData().catch(() => null);
  const token = String(fd?.get("token") ?? "");
  const txn = String(fd?.get("txn") ?? "");
  const out = await submitPause(requireStudioDb(), { token, txn }, process.env.MARKETING_SECRET_KEY);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com").replace(/\/$/, "");
  const back = new URL(`/video-review/${encodeURIComponent(token)}`, base);
  if (!out.ok) back.searchParams.set("e", out.message.slice(0, 200));
  return new Response(null, { status: 303, headers: { location: back.toString(), "cache-control": "no-store" } });
}
