import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { choosePlayback, getCanonical, verifyMediaAccess } from "@/lib/marketing-studio/media/canonical";

export const dynamic = "force-dynamic";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/**
 * The canonical player. A customer's website embeds THIS address for a video, whichever provider holds it: the page picks the customer's YouTube copy or the GravyBlock-hosted copy
 * when it is shown, so connecting YouTube later changes no website code. A video that is not public yet plays only with the owner's review link.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const { id } = await ctx.params;
  const c = await getCanonical(requireStudioDb(), id);
  if (!c) return notFoundResponse();
  const t = new URL(req.url).searchParams.get("t");
  if (c.status !== "public" && !verifyMediaAccess(id, t, process.env.MARKETING_SECRET_KEY)) return notFoundResponse();
  const pb = choosePlayback(c);
  if (!pb) return notFoundResponse();
  const body =
    pb.kind === "youtube"
      ? `<iframe src="${esc(pb.embedUrl)}" title="${esc(c.title)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`
      : `<video controls playsinline preload="metadata" ${pb.thumbKey ? `poster="/api/media/${esc(id)}/thumb"` : ""} style="position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000" title="${esc(c.title)}"><source src="/api/media/${esc(id)}/play${t ? `?t=${encodeURIComponent(t)}` : ""}" type="${esc(pb.contentType)}"></video>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(c.title)}</title><style>html,body{margin:0;height:100%;background:#000}</style></head><body>${body}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
