/**
 * The owner's accepted edits for a product's demo video (see publishing/review-intent.ts): how words are pronounced, the voice pace and the call to
 * action. They are applied on top of the product's spec every time it renders, so a correction lasts for later versions too. The spoken lexicon and the
 * pace reach the voice only; captions, the screen and every Product Truth claim keep their written text.
 */
import { randomUUID } from "node:crypto";
import type { StudioDb } from "../../db";
import { emptyOverrides, overridesKey, type VideoOverrides } from "../../publishing/review-intent";
import { getSetting, setSetting } from "../../runtime";
import { specFingerprint } from "../../publishing/review-replacement";
import { ensureSpec } from "../concepts/registry";
import { demoSpecFor, type DemoSpec } from "./specs";

export async function getOverrides(db: StudioDb, productId: string): Promise<VideoOverrides> {
  const v = await getSetting<VideoOverrides | null>(overridesKey(productId), null, db);
  return v && typeof v.paceFactor === "number" ? { ...emptyOverrides(), ...v } : emptyOverrides();
}

export async function saveOverrides(db: StudioDb, actor: string, productId: string, ov: VideoOverrides): Promise<void> {
  await setSetting(overridesKey(productId), ov, actor, db);
}

/** The fingerprint of a product's video as it would render now, with the owner's accepted edits applied. */
export async function effectiveSpecHash(db: StudioDb, productId: string, specId: string): Promise<string> {
  // a game clip has no demo script: every clip is its own cut of real footage, so each one is its own version
  if (specId.includes(":game-")) return `game:${specId}:${randomUUID().slice(0, 8)}`;
  const ov = await getOverrides(db, productId);
  await ensureSpec(db, specId);
  return specFingerprint(applyOverridesToSpec(demoSpecFor(specId), ov), { lexicon: ov.lexicon, pace: ov.paceFactor });
}

/** The spec with the owner's call-to-action edits applied. The end card, the on-screen button, the record and QA all follow the same wording and address. */
export function applyOverridesToSpec(spec: DemoSpec, ov: VideoOverrides): DemoSpec {
  // A call-to-action edit belongs to the product's default video; the other angles keep their own call to action.
  if ((!ov.ctaText && !ov.ctaUrl) || spec.angle) return spec;
  const text = ov.ctaText ?? spec.cta.text;
  const url = ov.ctaUrl ?? spec.cta.url;
  return {
    ...spec,
    cta: { ...spec.cta, text, url },
    site: { ...spec.site, ctaText: text },
    onScreen: spec.onScreen.map((o) => (o.kind === "cta" ? { ...o, text } : o)),
    build: (manifest, lt) => {
      const built = spec.build(manifest, lt);
      const scenes = built.timeline.scenes.map((s) => (s.kind === "end" && s.end_card ? { ...s, end_card: { ...s.end_card, button: text } } : s));
      return { ...built, timeline: { ...built.timeline, scenes } };
    },
  };
}
