/** The stored angle inventory (video_angles_<slug>): read, and update one angle as its video moves from planned to unlisted review to public. */
import type { StudioDb } from "./db";
import { angleKey, type AngleEntry } from "./library";
import { getSetting, setSetting } from "./runtime";

export const getAngles = (db: StudioDb, slug: string) => getSetting<AngleEntry[]>(angleKey(slug), [], db);

export async function updateAngle(db: StudioDb, actor: string, slug: string, match: (e: AngleEntry) => boolean, patch: Partial<AngleEntry>): Promise<AngleEntry | null> {
  const all = await getAngles(db, slug);
  const i = all.findIndex(match);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  await setSetting(angleKey(slug), all, actor, db, { audited: false });
  return all[i];
}
