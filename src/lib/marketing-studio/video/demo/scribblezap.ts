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

export const SZ_TITLE = "ScribbleZap: one cut, big payoff";
/**
 * Until a verified store listing is live the call to action is a product-focused invitation to the ScribbleZap game page, never a download prompt and never "follow the studio". language-qa.ts
 * rejects "coming soon" and store wording for games, and the run refuses an old spec once a verified store link exists.
 */
export const SZ_CTA = { text: "Check out ScribbleZap", url: "https://iscreamstudio.com/games/scribblezap/", display: "scribblezap.com" };

/**
 * Each voice line owns one or more footage beats. A beat is one stretch of real footage (see SZ_WINDOWS); a line's time is shared equally by
 * its beats, so the picture changes every two to three seconds while the voice keeps its own pace.
 */
export const SZ_BEATS: Array<{ id: string; line: string; headline?: string; fillSpot?: boolean }> = [
  { id: "hook", line: "L1", headline: "One cut. Big payoff." },
  { id: "pen", line: "L2", headline: "Hold. Drag. Fill." },
  { id: "sunset", line: "L3", headline: "New boards.", fillSpot: true },
  { id: "tennis", line: "L3", headline: "New balls." },
  { id: "lvl4", line: "L3b", headline: "Now try this one." },
  { id: "clear", line: "L4", headline: "Unlock more." },
  { id: "unlock", line: "L4" },
  { id: "home", line: "L5", headline: "Daily + Endless" },
  { id: "daily", line: "L5" },
];

/** The voice reads the names plainly ("Scribble Zap", "I Scream Studio"); captions and the end card always spell ScribbleZap and iScream Studio. */
export const SZ_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "hook", spoken: "One cut. Big payoff.", claims: ["c-cut"] },
  { id: "L2", sceneId: "pen", spoken: "Hold and drag. Watch the page fill up.", claims: ["c-hold", "c-cut"] },
  { id: "L3", sceneId: "sunset", spoken: "New balls. New boards. New trouble.", claims: ["c-world"] },
  { id: "L3b", sceneId: "lvl4", spoken: "Think you've got it? Now try this one.", claims: ["c-target", "c-world"] },
  { id: "L4", sceneId: "clear", spoken: "Clear a board. Unlock something new.", claims: ["c-unlock"] },
  { id: "L5", sceneId: "home", spoken: "A fresh Daily Challenge every day, plus Endless Run for more.", claims: ["c-daily", "c-run"] },
  { id: "L6", sceneId: "end", spoken: "How far can you get? Come find out. Check out Scribble Zap.", caption: "How far can you get? Come find out. Check out ScribbleZap.", claims: ["c-target", "c-page"] },
];

const P = "public";
const T = "play";
export const SZ_CLAIMS: Claim[] = [
  { id: "c-cut", text: "A cut claims the side without the enemy on it, and good cuts earn a bonus burst such as NICE CUT.", facts: ["claim the side without the enemy on it, and keep filling until the page is yours", "NICE CUT!"], sources: [{ plate: P, quote: "claim the side without the enemy on it, and keep filling until the page is yours" }, { plate: T, quote: "NICE CUT!" }] },
  { id: "c-hold", text: "You tap and hold to cut across the board.", facts: ["Tap and hold to cut across the board."], sources: [{ plate: P, quote: "Tap and hold to cut across the board." }] },
  { id: "c-world", text: "New balls, hazards and new boards show up as you play, one idea at a time (a Tennis Ball, a sunset Mastery board, a triangle board).", facts: ["New balls, hazards, and drawing tools show up one idea at a time.", "TRIANGLE BOARD"], sources: [{ plate: P, quote: "New balls, hazards, and drawing tools show up one idea at a time." }, { plate: T, quote: "Tennis Ball" }, { plate: T, quote: "MASTERY" }, { plate: T, quote: "TRIANGLE BOARD" }] },
  { id: "c-unlock", text: "Clearing boards earns new things: new tools, doodle pages and boards unlock.", facts: ["NEW DOODLE!", "NEW TOOL! PEN UNLOCKED!"], sources: [{ plate: T, quote: "NEW DOODLE!" }, { plate: T, quote: "Neon board unlocked" }, { plate: T, quote: "NEW TOOL! PEN UNLOCKED!" }] },
  { id: "c-daily", text: "A new Daily Challenge arrives on your local date.", facts: ["A new challenge on your local date"], sources: [{ plate: P, quote: "Daily Challenge" }, { plate: P, quote: "A new challenge on your local date" }] },
  { id: "c-run", text: "There is an Endless Run mode with upgrades for longer sessions.", facts: ["An Endless Run mode with upgrades for longer sessions"], sources: [{ plate: P, quote: "An Endless Run mode with upgrades for longer sessions" }] },
  { id: "c-target", text: "Every board has a fill target to beat (for example 60 percent FILL on the first board).", facts: ["60% FILL"], sources: [{ plate: T, quote: "60% FILL" }, { plate: P, quote: "keep filling until the page is yours" }] },
  { id: "c-page", text: "ScribbleZap has its own public game page, which the call to action points to.", facts: ["claim the side without the enemy on it, and keep filling until the page is yours"], sources: [{ plate: P, quote: "keep filling until the page is yours" }] },
];

export const SZ_FACTS: Array<{ plate: string; value: string }> = [
  { plate: P, value: "Tap and hold to cut across the board." },
  { plate: P, value: "claim the side without the enemy on it, and keep filling until the page is yours" },
  { plate: P, value: "New balls, hazards, and drawing tools show up one idea at a time." },
  { plate: P, value: "A new challenge on your local date" },
  { plate: P, value: "An Endless Run mode with upgrades for longer sessions" },
  // facts read from the game's own screens (the private tester page), as it displayed them while played
  { plate: T, value: "NICE CUT!" },
  { plate: T, value: "60% FILL" },
  { plate: T, value: "NEW DOODLE!" },
  { plate: T, value: "NEW TOOL! PEN UNLOCKED!" },
  { plate: T, value: "TRIANGLE BOARD" },
];

export const SZ_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "hook", kind: "headline", text: "One cut. Big payoff.", claim: "c-cut" },
  { sceneId: "pen", kind: "headline", text: "Hold. Drag. Fill.", claim: "c-hold" },
  { sceneId: "sunset", kind: "headline", text: "New boards.", claim: "c-world" },
  { sceneId: "sunset", kind: "label", text: "Beat the target", claim: "c-target" },
  { sceneId: "tennis", kind: "headline", text: "New balls.", claim: "c-world" },
  { sceneId: "lvl4", kind: "headline", text: "Now try this one.", claim: "c-target" },
  { sceneId: "clear", kind: "headline", text: "Unlock more.", claim: "c-unlock" },
  { sceneId: "home", kind: "headline", text: "Daily + Endless", claim: "c-daily" },
  { sceneId: "end", kind: "headline", text: "How far can you get?", claim: "c-target" },
  { sceneId: "end", kind: "cta", text: "Check out ScribbleZap", claim: "c-page" },
];

const four = (a: string, b: string, c: string, d: string) => [a, b, c, d];
export const SZ_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
    hook: { plate: "play", purpose: "Hook: a real cut and the game's own big-cut burst, straight away.", motion: four("real gameplay at about 50 fps: the pen draws a cut", "the game's own big-cut burst and particles", "slow camera push on the board", "kinetic headline"), note: "Footage of the private web tester (level 2), played by scripted touch input." },
  pen: { plate: "play", purpose: "How it plays: the game's own pen-unlocked tip card, then tap and hold draws the first cut.", motion: four("the game's own PEN UNLOCKED tip card with confetti", "tap and hold, the pen draws across the board", "hatched territory appears behind the cut", "camera drifts along the board"), note: "Footage of the private web tester (level 1, first seconds), played by scripted touch input." },
  sunset: { plate: "play", purpose: "A visibly different, harder stage: the sunset board at 95 percent fill, with the fill meter highlighted.", motion: four("real gameplay on the sunset-themed Mastery stage", "cuts shrink the open area while the ball bounces", "focus highlight on the fill meter", "camera pushes toward the meter"), note: "Footage of the private web tester (level 5, goal 95 percent fill)." },
  lvl4: { plate: "play", purpose: "The challenge: a later board with a 91 percent fill target and a board already full of cuts.", motion: four("real gameplay on a later, harder board", "cuts and a combo burst as the open area shrinks", "the fill meter climbs toward a bigger target", "camera drifts across the board"), note: "Footage of the private web tester (level 4, goal 91 percent fill)." },
  tennis: { plate: "play", purpose: "A different ball: the Tennis Ball stage, with a combo burst.", motion: four("real gameplay with the Tennis Ball and its trail", "the game's own combo burst", "cuts fill the board", "camera drifts across the board"), note: "Footage of the private web tester (level 7)." },
  unlock: { plate: "play", purpose: "Reward: the game's own TENNIS BALL UNLOCKED card.", motion: four("the game's own unlock card with confetti", "the new ball appears on the next board", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (the unlock card after Basics Mastered, then the next board)." },
  daily: { plate: "play", purpose: "A different board and a hazard: the Daily Challenge's dark triangular board with its spinning-gem obstacle.", motion: four("real gameplay on the Daily Challenge board", "the spinning-gem obstacle drifts and spins", "the game's own CLUTCH reward", "camera drifts across the board"), note: "Footage of the private web tester (Daily Challenge)." },
  clear: { plate: "play", purpose: "Celebration: the game's own BASICS MASTERED card with its Neon board unlock.", motion: four("the game's own clear card with stars and confetti", "the unlock banner animates in", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (after level 5)." },
  home: { plate: "play", purpose: "Beyond the levels: the game's own home screen with its Daily Challenge and Endless Run cards.", motion: four("the game's own start screen with its animated background", "the Daily Challenge and Endless Run cards", "slow camera push", "kinetic headline"), note: "Footage of the private web tester (home screen)." },
  end: { purpose: "Call to action: an invitation to check out ScribbleZap on its own game page (no download is implied).", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no gameplay is claimed here and nothing implies a download." },
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
  const lastId = SZ_NARRATION[SZ_NARRATION.length - 1].id;
  const durationMs = lt[lastId].end + 1300;
  const endStart = bounds[bounds.length - 1].e - TRANSITION_MS;

  const scenes: StageScene[] = SZ_BEATS.map((beat, i) => {
    const start = i === 0 ? 0 : bounds[i].s - TRANSITION_MS;
    const end = bounds[i].e;
    const len = end - start;
    const c = clips[beat.id];
    if (!c) throw new Error(`no footage for ${beat.id}`);
    if (len > (c.frames.length / c.fps) * 1000 + 60) throw new Error(`beat ${beat.id} (${Math.round(len)} ms) outruns its footage (${Math.round((c.frames.length / c.fps) * 1000)} ms)`);
    const spots: SpotKey[] = beat.fillSpot ? [{ from: Math.round(len * 0.25), to: Math.round(len * 0.7), rect: manifest.plates.play.rects.fill, label: "Beat the target" }] : [];
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
  scenes.push({ id: "end", kind: "end", start: Math.round(endStart), end: durationMs, end_card: { headline: "How far can you get?", button: SZ_CTA.text, url: SZ_CTA.display } });

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
