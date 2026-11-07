import sharp from "sharp";
import { studioEnabledByEnv } from "@/lib/marketing-studio/config";
import { requireStudioDb } from "@/lib/marketing-studio/db";
import { notFoundResponse } from "@/lib/marketing-studio/http";
import { isReviewedVideo } from "@/lib/marketing-studio/publishing/review-flow";

export const dynamic = "force-dynamic";

const W = 1200;
const H = 675;
const play = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><circle cx="${W / 2}" cy="${H / 2}" r="64" fill="rgba(0,0,0,0.62)"/><circle cx="${W / 2}" cy="${H / 2}" r="64" fill="none" stroke="#fff" stroke-width="4"/><polygon points="${W / 2 - 18},${H / 2 - 30} ${W / 2 - 18},${H / 2 + 30} ${W / 2 + 34},${H / 2}" fill="#fff"/></svg>`,
);

async function frame(videoId: string): Promise<Buffer | null> {
  for (const name of ["maxresdefault", "hqdefault"]) {
    try {
      const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${name}.jpg`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
    } catch {
      /* try the next size */
    }
  }
  return null;
}

/** The email thumbnail: the video's own YouTube frame (a vertical Short, centered on a dark card) with a play button, as one normal image. Only for videos that have a review. */
export async function GET(_req: Request, ctx: { params: Promise<{ videoId: string }> }) {
  if (!studioEnabledByEnv()) return notFoundResponse();
  const { videoId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId) || !(await isReviewedVideo(requireStudioDb(), videoId))) return notFoundResponse();
  const src = await frame(videoId);
  let base: sharp.Sharp;
  if (src) {
    const meta = await sharp(src).metadata();
    const sw = meta.width ?? 1280;
    const sh = meta.height ?? 720;
    // A Short is a 9:16 picture centered in a 16:9 frame with black bars: keep only the picture.
    const cw = Math.min(sw, Math.round((sh * 9) / 16));
    const picture = await sharp(src).extract({ left: Math.round((sw - cw) / 2), top: 0, width: cw, height: sh }).resize({ height: H, fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
    base = sharp({ create: { width: W, height: H, channels: 3, background: { r: 12, g: 12, b: 18 } } }).composite([{ input: picture, gravity: "center" }]);
  } else {
    base = sharp({ create: { width: W, height: H, channels: 3, background: { r: 12, g: 12, b: 18 } } });
  }
  const out = await base.composite([{ input: play, top: 0, left: 0 }]).jpeg({ quality: 85 }).toBuffer();
  return new Response(new Uint8Array(out), { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" } });
}
