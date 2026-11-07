/**
 * Owner rule 2026-11-07: a game with no verified live install destination gets no new videos or publications while the pause is on. It lifts for a
 * game by itself once Product Truth holds a verified Google Play or App Store listing. Posts already public are never touched.
 */
import { GAME_ACQUISITION_PAUSE } from "../rollout";
import type { StudioDb } from "../db";
import { listFacts } from "../repository";
import { getSetting } from "../runtime";
import { INTERNAL_SCOPE } from "../scope";
import { storeDestination } from "../video/demo/language-qa";

export async function gameAcquisitionPaused(db: StudioDb, product: { id: string; kind: string }): Promise<boolean> {
  if (product.kind !== "mobile_game") return false;
  if (!(await getSetting<boolean>(GAME_ACQUISITION_PAUSE.setting, false, db))) return false;
  const facts = (await listFacts(INTERNAL_SCOPE, product.id, db)).filter((f) => f.status === "current").map((f) => ({ value: f.factValue, verified: Boolean(f.verifiedAt) }));
  return !storeDestination(facts);
}

export const GAME_PAUSE_MESSAGE = "Game acquisition is paused until this game has a verified live store listing (owner rule 2026-11-07). Nothing new is made or sent for it.";
