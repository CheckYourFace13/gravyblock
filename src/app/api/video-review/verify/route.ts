import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { confirmEmailChange } from "@/lib/marketing-studio/publishing/review-contact";

export const dynamic = "force-dynamic";

/** The protected half of confirming a review address: a plain form post carrying the one-time secret from the email sent to that address. */
export async function POST(req: Request) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const fd = await req.formData().catch(() => null);
  const token = String(fd?.get("token") ?? "");
  const out = await confirmEmailChange(requireStudioDb(), token);
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://gravyblock.com").replace(/\/$/, "");
  const back = new URL(`/video-review/verify/${encodeURIComponent(token)}`, base);
  if (out.ok) back.searchParams.set("done", "1");
  else back.searchParams.set("e", out.reason === "expired" ? "This link expired. Request the change again from the dashboard." : "This link is not valid or was already used.");
  return new Response(null, { status: 303, headers: { location: back.toString(), "cache-control": "no-store" } });
}
