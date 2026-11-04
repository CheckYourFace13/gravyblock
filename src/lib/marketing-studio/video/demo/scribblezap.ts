/**
 * The ScribbleZap video (v2, multi-level trailer): REAL gameplay is the primary visual and changes every few seconds. Everything shown is footage
 * of the game's own private web tester played by scripted touch input across many levels, plus the game's own unlock and clear cards, its home
 * screen and its Daily Challenge board. Everything said is on the public product page (quoted and tied to verified Product Truth facts). Nothing
 * is drawn, composited or invented, and no claim is made that the footage does not show.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import { SZ_PLATE } from "./scribblezap-capture";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type Manifest, type NarrationLine, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const SZ_TITLE = "ScribbleZap: real gameplay across levels, cut a line and fill the page";
export const SZ_CTA = { text: "Coming soon", url: "https://iscreamstudio.com/games/scribblezap/", display: "scribblezap.com" };

/**
 * Each voice line owns one or more footage beats. A beat is one stretch of real footage (see SZ_WINDOWS); a line's time is shared equally by
 * its beats, so the picture changes every two to three seconds while the voice keeps its own pace.
 */
export const SZ_BEATS: Array<{ id: string; line: string; headline?: string; fillSpot?: boolean }> = [
  { id: "hook", line: "L1", headline: "Cut a line." },
  { id: "pen", line: "L2", headline: "Tap and hold" },
  { id: "sunset", line: "L3", headline: "Fill the page", fillSpot: true },
  { id: "tennis", line: "L3" },
  { id: "unlock", line: "L4", headline: "One idea at a time" },
  { id: "clear", line: "L5", headline: "Hand-crafted stages" },
  { id: "home", line: "L6", headline: "Daily Challenge" },
  { id: "daily", line: "L6" },
];

/** The voice reads the names phonetically; captions and the end card spell ScribbleZap and iScream Studio. */
export const SZ_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "hook", spoken: "Cut a line. Keep the safe side. Fill the page.", claims: ["c-loop"] },
  { id: "L2", sceneId: "pen", spoken: "Tap and hold to cut across the board.", claims: ["c-hold"] },
  { id: "L3", sceneId: "sunset", spoken: "Claim the side without the enemy, and keep {fill}filling until the page is yours.", claims: ["c-claim"] },
  { id: "L4", sceneId: "unlock", spoken: "New balls, hazards, and drawing tools show up one idea at a time.", claims: ["c-ideas"] },
  { id: "L5", sceneId: "clear", spoken: "Hand-crafted stages, then endless play after the campaign.", claims: ["c-endless"] },
  { id: "L6", sceneId: "home", spoken: "A new Daily Challenge on your local date, and an Endless Run with upgrades.", claims: ["c-daily", "c-run"] },
  { id: "L7", sceneId: "end", spoken: "Scribble Zap. Coming soon from I Scream Studio.", caption: "ScribbleZap. Coming soon from iScream Studio. ScribbleZap.com", claims: ["c-genre", "c-cta"] },
];

const P = "public";
export const SZ_CLAIMS: Claim[] = [
  { id: "c-loop", text: "The public page's headline for the game is: Cut a line. Keep the safe side. Fill the page.", facts: ["Cut a line. Keep the safe side. Fill the page."], sources: [{ plate: P, quote: "Cut a line. Keep the safe side. Fill the page." }] },
  { id: "c-hold", text: "You tap and hold to cut across the board.", facts: ["Tap and hold to cut across the board."], sources: [{ plate: P, quote: "Tap and hold to cut across the board." }] },
  { id: "c-claim", text: "You claim the side without the enemy on it and keep filling until the page is yours.", facts: ["claim the side without the enemy on it, and keep filling until the page is yours"], sources: [{ plate: P, quote: "claim the side without the enemy on it, and keep filling until the page is yours" }] },
  { id: "c-ideas", text: "New balls, hazards, and drawing tools show up one idea at a time.", facts: ["New balls, hazards, and drawing tools show up one idea at a time."], sources: [{ plate: P, quote: "New balls, hazards, and drawing tools show up one idea at a time." }] },
  { id: "c-endless", text: "The stages are hand-crafted, with endless play after the campaign.", facts: ["then endless play after the campaign"], sources: [{ plate: P, quote: "then endless play after the campaign" }, { plate: P, quote: "Hand-crafted stages" }] },
  { id: "c-daily", text: "A new Daily Challenge arrives on your local date.", facts: ["A new challenge on your local date"], sources: [{ plate: P, quote: "Daily Challenge" }, { plate: P, quote: "A new challenge on your local date" }] },
  { id: "c-run", text: "There is an Endless Run mode with upgrades for longer sessions.", facts: ["An Endless Run mode with upgrades for longer sessions"], sources: [{ plate: P, quote: "An Endless Run mode with upgrades for longer sessions" }] },
  { id: "c-genre", text: "ScribbleZap is a draw-and-fill puzzle game from iScream Studio.", facts: ["A draw-and-fill puzzle game."], sources: [{ plate: P, quote: "A draw-and-fill puzzle game." }, { plate: P, quote: "ScribbleZap is a mobile puzzle game from iScream Studio." }] },
  { id: "c-cta", text: "The store listings are not live yet: Google Play and the App Store are both marked Coming Soon.", facts: ["Google Play — Coming Soon"], sources: [{ plate: P, quote: "Google Play — Coming Soon" }, { plate: P, quote: "App Store — Coming Soon" }] },
];

export const SZ_FACTS: Array<{ plate: string; value: string }> = [
  { plate: P, value: "Cut a line. Keep the safe side. Fill the page." },
  { plate: P, value: "Tap and hold to cut across the board." },
  { plate: P, value: "claim the side without the enemy on it, and keep filling until the page is yours" },
  { plate: P, value: "New balls, hazards, and drawing tools show up one idea at a time." },
  { plate: P, value: "then endless play after the campaign" },
  { plate: P, value: "A new challenge on your local date" },
  { plate: P, value: "An Endless Run mode with upgrades for longer sessions" },
  { plate: P, value: "A draw-and-fill puzzle game." },
  { plate: P, value: "Google Play — Coming Soon" },
];

export const SZ_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "hook", kind: "headline", text: "Cut a line.", claim: "c-loop" },
  { sceneId: "pen", kind: "headline", text: "Tap and hold", claim: "c-hold" },
  { sceneId: "sunset", kind: "headline", text: "Fill the page", claim: "c-loop" },
  { sceneId: "sunset", kind: "label", text: "Fill meter", claim: "c-claim" },
  { sceneId: "unlock", kind: "headline", text: "One idea at a time", claim: "c-ideas" },
  { sceneId: "clear", kind: "headline", text: "Hand-crafted stages", claim: "c-endless" },
  { sceneId: "home", kind: "headline", text: "Daily Challenge", claim: "c-daily" },
  { sceneId: "end", kind: "headline", text: "A draw-and-fill puzzle game.", claim: "c-genre" },
  { sceneId: "end", kind: "cta", text: "Coming soon", claim: "c-cta" },
];

const four = (a: string, b: string, c: string, d: string) => [a, b, c, d];
export const SZ_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  hook: { plate: "play", purpose: "Hook: a real cut with the game's own combo burst, with the page's headline over it.", motion: four("real gameplay at about 50 fps: the pen draws a cut", "the game's own big-cut burst and particles", "slow camera push on the board", "kinetic headline"), note: "Footage of the private web tester (level 2), played by scripted touch input." },
  pen: { plate: "play", purpose: "How it plays: the game's own pen-unlocked tip card, then tap and hold draws the first cut.", motion: four("the game's own PEN UNLOCKED tip card with confetti", "tap and hold, the pen draws across the board", "hatched territory appears behind the cut", "camera drifts along the board"), note: "Footage of the private web tester (level 1, first seconds), played by scripted touch input." },
  sunset: { plate: "play", purpose: "A visibly different, harder stage: the sunset board at 95 percent fill, with the fill meter highlighted.", motion: four("real gameplay on the sunset-themed Mastery stage", "cuts shrink the open area while the ball bounces", "focus highlight on the fill meter", "camera pushes toward the meter"), note: "Footage of the private web tester (level 5, goal 95 percent fill)." },
  tennis: { plate: "play", purpose: "A different ball: the Tennis Ball stage, with a combo burst.", motion: four("real gameplay with the Tennis Ball and its trail", "the game's own combo burst", "cuts fill the board", "camera drifts across the board"), note: "Footage of the private web tester (level 7)." },
  unlock: { plate: "play", purpose: "Reward: the game's own TENNIS BALL UNLOCKED card.", motion: four("the game's own unlock card with confetti", "the new ball appears on the next board", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (the unlock card after Basics Mastered, then the next board)." },
  daily: { plate: "play", purpose: "A different board and a hazard: the Daily Challenge's dark triangular board with its spinning-gem obstacle.", motion: four("real gameplay on the Daily Challenge board", "the spinning-gem obstacle drifts and spins", "the game's own CLUTCH reward", "camera drifts across the board"), note: "Footage of the private web tester (Daily Challenge)." },
  clear: { plate: "play", purpose: "Celebration: the game's own BASICS MASTERED card with its Neon board unlock.", motion: four("the game's own clear card with stars and confetti", "the unlock banner animates in", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (after level 5)." },
  home: { plate: "play", purpose: "Beyond the levels: the game's own home screen with its Daily Challenge and Endless Run cards.", motion: four("the game's own start screen with its animated background", "the Daily Challenge and Endless Run cards", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (home screen)." },
  end: { purpose: "Call to action: coming soon, ScribbleZap.com.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no gameplay is claimed here." },
};

// ---- timing ------------------------------------------------------------------------------------------------------------------------

const END_LEAD_MS = 800;

export function szLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 250;
  SZ_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === SZ_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 380;
    const d = durMs[l.id];
    if (!d) throw new Error(`no audio duration for line ${l.id}`);
    out[l.id] = { start: t, end: t + d, durMs: d };
    t += d;
  });
  return out;
}

function ascending<T extends { t: number }>(keys: T[], gap = 200): T[] {
  const out: T[] = [];
  for (const k of keys.sort((a, b) => a.t - b.t)) {
    const prev = out[out.length - 1];
    out.push(prev && k.t < prev.t + gap ? { ...k, t: prev.t + gap } : k);
  }
  return out;
}

/** Gentle camera drift over a beat: six keyframes, the push-in halved and the framing kept high so the game's own HUD is never cropped. */
function drift(len: number, path: Array<[number, number]>): CameraKey[] {
  return ascending(path.map(([cy, zoom], i) => {
    const z = 1 + (zoom - 1) * 0.5;
    return { t: Math.round((len * i) / (path.length - 1)), cx: 195, cy: Math.round(390 - (z - 1) * 300 + (cy - 440) * 0.3), zoom: Math.round(z * 1000) / 1000 };
  }), 120);
}
const PATHS: Array<Array<[number, number]>> = [
  [[430, 1.0], [440, 1.04], [450, 1.08], [450, 1.1], [445, 1.12], [440, 1.12]],
  [[420, 1.04], [430, 1.08], [440, 1.1], [450, 1.12], [450, 1.12], [445, 1.1]],
  [[440, 1.0], [440, 1.05], [450, 1.1], [450, 1.12], [440, 1.1], [430, 1.06]],
];

export type BuiltSzDemo = { timeline: Timeline; lineWords: Record<string, WordTime[]>; scenes: StageScene[] };

export function szBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltSzDemo {
  const parsed = Object.fromEntries(SZ_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(SZ_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const clips = manifest.clips;
  if (!clips) throw new Error("ScribbleZap needs its gameplay clips");

  // beat boundaries: each product line's span (from just before it speaks to just before the next line) is shared by its beats
  const productLines = SZ_NARRATION.filter((l) => l.sceneId !== "end");
  const spanStart = (k: number) => (k === 0 ? 0 : lt[productLines[k].id].start - 150);
  const spanEnd = (k: number) => (k + 1 < productLines.length ? spanStart(k + 1) : lt[productLines[k].id].end + 650);
  const bounds: Array<{ s: number; e: number }> = [];
  productLines.forEach((l, k) => {
    const mine = SZ_BEATS.filter((b) => b.line === l.id);
    const a = spanStart(k);
    const b = spanEnd(k);
    mine.forEach((_, j) => bounds.push({ s: a + ((b - a) * j) / mine.length, e: a + ((b - a) * (j + 1)) / mine.length }));
  });
  if (bounds.length !== SZ_BEATS.length) throw new Error("every beat must belong to a product line");
  const durationMs = lt.L7.end + 1300;
  const endStart = bounds[bounds.length - 1].e - TRANSITION_MS;

  const scenes: StageScene[] = SZ_BEATS.map((beat, i) => {
    const start = i === 0 ? 0 : bounds[i].s - TRANSITION_MS;
    const end = bounds[i].e;
    const len = end - start;
    const c = clips[beat.id];
    if (!c) throw new Error(`no footage for ${beat.id}`);
    if (len > (c.frames.length / c.fps) * 1000 + 60) throw new Error(`beat ${beat.id} (${Math.round(len)} ms) outruns its footage (${Math.round((c.frames.length / c.fps) * 1000)} ms)`);
    const spots: SpotKey[] = beat.fillSpot ? [{ from: Math.round(len * 0.25), to: Math.round(len * 0.7), rect: manifest.plates.play.rects.fill, label: "Fill meter" }] : [];
    return {
      id: beat.id,
      kind: "screen" as const,
      start: Math.round(start),
      end: Math.round(end),
      plate: "play",
      states: [],
      clip: { frames: c.frames, fps: c.fps, from: 0 },
      camera: drift(Math.round(len), PATHS[i % PATHS.length]),
      spots,
      ...(beat.headline ? { headline: { text: beat.headline, from: 60, to: Math.max(1100, Math.round(len * 0.8)) } } : {}),
    };
  });
  scenes.push({ id: "end", kind: "end", start: Math.round(endStart), end: durationMs, end_card: { headline: "A draw-and-fill puzzle game.", button: SZ_CTA.text, url: SZ_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of SZ_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = { play: { w: PLATE_CSS_W, h: SZ_PLATE.h, states: {} } };
  return {
    timeline: {
      durationMs,
      // a phone-shaped window so the whole game screen is visible (the game is 390 x 780 here; it is not stretched)
      win: { x: 245, y: 330, w: 590, h: 1180, r: 44 },
      brand: { name: "ScribbleZap", accent: "#8b5cf6", dark: "#14102b", light: "#f5f3ff", logo: manifest.logo, palette: { blobs: ["#ec4899", "#3b82f6"], endFrom: "#7c3aed", endMid: "#6d28d9", endTo: "#1e1b4b", button: "#6d28d9", ripple: "rgba(139,92,246,.25)" } },
      plates,
      scenes,
      captions,
    },
    lineWords,
    scenes,
  };
}
