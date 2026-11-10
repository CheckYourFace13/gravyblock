import { promises as fs } from "node:fs";
import { STUDIO_DIRS } from "@/lib/marketing-studio/config";
import { notFoundResponse, studioApiAuthorized } from "@/lib/marketing-studio/http";
import { safeJoin } from "@/lib/marketing-studio/storage";
import { isOffered } from "@/lib/marketing-studio/video/voices";

export const dynamic = "force-dynamic";

/** Plays a voice preview in the settings page. Only the curated voices exist here, and only a signed-in owner or customer can fetch them. */
export async function GET(_req: Request, ctx: { params: Promise<{ voice: string }> }) {
  if (!(await studioApiAuthorized())) return notFoundResponse();
  const { voice } = await ctx.params;
  if (!isOffered(voice)) return notFoundResponse();
  try {
    const file = await fs.readFile(safeJoin(STUDIO_DIRS.media, "previews", `${voice}.mp3`));
    return new Response(new Uint8Array(file), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", "content-length": String(file.length) } });
  } catch {
    return notFoundResponse();
  }
}
