import { VIDEO } from "../config";

export const MOTIONS = ["none", "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_down"] as const;
export type Motion = (typeof MOTIONS)[number];

/** A title or CTA card, rendered through the same template engine and QA as static creatives. */
export type CardScene = {
  type: "card";
  seconds: number;
  family: "announcement" | "product_benefit" | "feature_highlight" | "cta";
  headline: string;
  subhead?: string | null;
  badge?: string | null;
  cta?: { text: string; url: string } | null;
};

/** A real approved screenshot or capture, with simple deterministic motion and an optional burned caption. */
export type ImageScene = {
  type: "image";
  seconds: number;
  assetId: string;
  motion: Motion;
  caption?: string | null;
};

export type Scene = CardScene | ImageScene;

export type Storyboard = {
  version: 1;
  scenes: Scene[];
  transition: "fade" | "slideleft" | "slideright" | "wipeleft" | "circleopen";
  /** Optional existing, approved audio asset. */
  audioAssetId?: string | null;
};

export function storyboardSeconds(sb: Storyboard): number {
  const sum = sb.scenes.reduce((n, s) => n + s.seconds, 0);
  return +(sum - Math.max(0, sb.scenes.length - 1) * VIDEO.transitionSeconds).toFixed(2);
}

/** Structural validation of a storyboard before any rendering starts. */
export function validateStoryboard(sb: Storyboard): string[] {
  const errors: string[] = [];
  if (sb.version !== 1) errors.push("unsupported storyboard version");
  if (!Array.isArray(sb.scenes) || sb.scenes.length < 2) errors.push("a video needs at least two scenes");
  if (sb.scenes.length > VIDEO.maxScenes) errors.push(`too many scenes (max ${VIDEO.maxScenes})`);
  for (const [i, s] of sb.scenes.entries()) {
    if (!(s.seconds >= 2 && s.seconds <= 12)) errors.push(`scene ${i + 1}: seconds must be between 2 and 12`);
    // Clips are cut and joined on keyframes placed every 0.5 s, so scene lengths are whole multiples of 0.5.
    if (Math.abs(s.seconds * 2 - Math.round(s.seconds * 2)) > 1e-9) errors.push(`scene ${i + 1}: seconds must be a multiple of 0.5`);
    if (s.type === "card" && !s.headline?.trim()) errors.push(`scene ${i + 1}: a card needs a headline`);
    if (s.type === "image" && !/^[0-9a-f-]{36}$/i.test(s.assetId)) errors.push(`scene ${i + 1}: invalid asset id`);
    if (s.type === "image" && !MOTIONS.includes(s.motion)) errors.push(`scene ${i + 1}: unknown motion`);
  }
  if (sb.scenes[0]?.type !== "card") errors.push("the first scene must be a title card");
  if (sb.scenes.at(-1)?.type !== "card" || (sb.scenes.at(-1) as CardScene).family !== "cta") errors.push("the last scene must be a call to action card");
  const total = storyboardSeconds(sb);
  if (total > VIDEO.maxSeconds + 0.5) errors.push(`video is ${total}s, over the ${VIDEO.maxSeconds}s limit`);
  return errors;
}
