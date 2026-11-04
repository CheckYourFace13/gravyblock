/**
 * The Mibble Meadow trailer: fun first, features second. REAL gameplay is the primary visual (the game's own project files from the published
 * APK, played with real taps, a swipe and double-taps, frame-exact at 30 fps). The voice sells the cute animals, the satisfying solve, the
 * celebrations and the variety; every line is tied to the game's tester page or to what the capture itself observed, and to matching footage.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import { MB_PLATE } from "./mibble-capture";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type Manifest, type NarrationLine, type StageScene, type Timeline, type WordTime } from "./types";

export const MB_TITLE = "Mibble Meadow: find a home for every animal";
/** Pre-launch invitation; the game is a private phone test with no public store listing, so nothing implies a download. */
export const MB_CTA = { text: "Follow iScream Studio", url: "https://iscreamstudio.com/games/", display: "iscreamstudio.com" };

export const MB_BEATS: Array<{ id: string; line: string; headline?: string }> = [
  { id: "hook", line: "L1", headline: "Find their spots." },
  { id: "cute", line: "L2", headline: "Cute + clever." },
  { id: "touch", line: "L3", headline: "No touching!" },
  { id: "cheer", line: "L4", headline: "Meadow cheers!" },
  { id: "grow", line: "L5", headline: "New puzzle, new meadow." },
  { id: "fresh", line: "L5" },
  { id: "stars", line: "L6", headline: "Chase 3 stars." },
  { id: "home", line: "L7", headline: "Daily Meadow" },
];

/** The voice says "I Scream Studio"; captions and the end card always spell iScream Studio. */
export const MB_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "hook", spoken: "Find a home for every animal.", claims: ["c-place"] },
  { id: "L2", sceneId: "cute", spoken: "Cute faces. Clever puzzles.", claims: ["c-cozy"] },
  { id: "L3", sceneId: "touch", spoken: "But no two animals can touch.", claims: ["c-touch"] },
  { id: "L4", sceneId: "cheer", spoken: "Get it right and the meadow cheers.", claims: ["c-cheer"] },
  { id: "L5", sceneId: "grow", spoken: "Every meadow is a new puzzle.", claims: ["c-varied"] },
  { id: "L6", sceneId: "stars", spoken: "Chase those three stars.", claims: ["c-cheer"] },
  { id: "L7", sceneId: "home", spoken: "There's a Daily Meadow, too.", claims: ["c-daily"] },
  { id: "L8", sceneId: "end", spoken: "How many meadows can you clear? Follow I Scream Studio.", caption: "How many meadows can you clear? Follow iScream Studio.", claims: ["c-invite"] },
];

const P = "public";
const G = "play";
const BOARDS = "Boards played: 4 by 4, then 4 by 4, then 4 by 4, then 5 by 5, then 4 by 4, then 5 by 5.";
const CELEBRATE = "Every solved level ended on a celebration screen with an animal, a title, stars and a score";
const HOME = "The home screen offers Play, Daily Meadow and Endless Meadow.";
export const MB_CLAIMS: Claim[] = [
  { id: "c-place", text: "You place one resident per meadow, row and column.", facts: ["Place one resident per meadow, row, and column"], sources: [{ plate: P, quote: "Place one resident per meadow, row, and column" }] },
  { id: "c-cozy", text: "Mibble Meadow is billed as cozy animal puzzles.", facts: ["Cozy Animal Puzzles"], sources: [{ plate: P, quote: "Cozy Animal Puzzles" }] },
  { id: "c-touch", text: "The animals never touch, even at the corners.", facts: ["they never touch, even at the corners"], sources: [{ plate: P, quote: "they never touch, even at the corners" }] },
  { id: "c-cheer", text: "Each solved level ends on a celebration screen with an animal, a title, stars and a score.", facts: [CELEBRATE], sources: [{ plate: G, quote: CELEBRATE }] },
  { id: "c-varied", text: "Each meadow is a different board (the first six played were 4 by 4 and 5 by 5 with different meadow shapes and colours).", facts: [BOARDS], sources: [{ plate: G, quote: BOARDS }] },
  { id: "c-daily", text: "The home screen has a Daily Meadow next to Play and Endless Meadow.", facts: [HOME], sources: [{ plate: G, quote: HOME }] },
  { id: "c-invite", text: "Mibble Meadow is published by iScream Studio.", facts: ["iScream Studio"], sources: [{ plate: P, quote: "iScream Studio" }] },
];

/** Observed-in-footage facts are recorded with the capture as their source (not a public page). */
export const MB_FACTS: Array<{ plate: string; value: string; kind?: "asset_metadata" }> = [
  { plate: P, value: "Place one resident per meadow, row, and column" },
  { plate: P, value: "Cozy Animal Puzzles" },
  { plate: P, value: "they never touch, even at the corners" },
  { plate: P, value: "iScream Studio" },
  { plate: G, value: CELEBRATE, kind: "asset_metadata" },
  { plate: G, value: BOARDS, kind: "asset_metadata" },
  { plate: G, value: HOME, kind: "asset_metadata" },
];

export const MB_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "hook", kind: "headline", text: "Find their spots.", claim: "c-place" },
  { sceneId: "cute", kind: "headline", text: "Cute + clever.", claim: "c-cozy" },
  { sceneId: "touch", kind: "headline", text: "No touching!", claim: "c-touch" },
  { sceneId: "cheer", kind: "headline", text: "Meadow cheers!", claim: "c-cheer" },
  { sceneId: "grow", kind: "headline", text: "New puzzle, new meadow.", claim: "c-varied" },
  { sceneId: "stars", kind: "headline", text: "Chase 3 stars.", claim: "c-cheer" },
  { sceneId: "home", kind: "headline", text: "Daily Meadow", claim: "c-daily" },
  { sceneId: "end", kind: "headline", text: "How many can you clear?", claim: "c-varied" },
  { sceneId: "end", kind: "cta", text: "Follow iScream Studio", claim: "c-invite" },
];

const four = (a: string, b: string, c: string, d: string) => [a, b, c, d];
const note = "Footage of the real Mibble Meadow 0.1.23 (the APK's own project files in Godot 4.7.2), played by real taps and double-taps; frame-exact at 30 fps.";
export const MB_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  hook: { plate: "play", purpose: "Hook: animals landing on a 5 by 5 board until the puzzle is solved.", motion: four("animals placed one by one by real double-taps", "the board fills with cute faces", "the solve ends on the game's own celebration", "kinetic headline"), note },
  cute: { plate: "play", purpose: "Cute animals and a celebration: the game's own results screen with a bunny, a title, stars and a score.", motion: four("the results screen animates in with confetti", "the bunny and its title bounce", "stars and score appear", "slow camera push"), note },
  touch: { plate: "play", purpose: "The challenge: marks and placements on a board where no two animals may touch.", motion: four("real single-tap marks and a swipe of marks", "double-tap placements", "the rules strip and animal row at the top", "camera drifts across the board"), note },
  cheer: { plate: "play", purpose: "Reward: the fox's celebration screen after a solve.", motion: four("the celebration screen animates in", "the fox and its title", "stars and score", "slow camera push"), note },
  grow: { plate: "play", purpose: "Variety: a bigger 5 by 5 meadow.", motion: four("real marks and placements on a 5 by 5 board", "animals landing one by one", "the board completes", "camera drifts across the board"), note },
  fresh: { plate: "play", purpose: "Variety: another meadow with a different shape and colours.", motion: four("real placements on a differently shaped board", "different meadow colours and layout", "animals landing one by one", "camera drifts across the board"), note },
  stars: { plate: "play", purpose: "Reward: the panda's celebration screen with three stars.", motion: four("the celebration screen animates in", "the panda and its title", "three stars and a score", "slow camera push"), note },
  home: { plate: "play", purpose: "Beyond the levels: the splash with its running animals, then the home screen with Play, Daily Meadow and Endless Meadow.", motion: four("the splash's animals run across the meadow", "the home screen slides in", "the Daily Meadow and Endless Meadow buttons", "slow camera push"), note },
  end: { purpose: "Call to action: follow iScream Studio (the game is a private phone test and not on a store).", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no gameplay is claimed here and nothing implies a download." },
};

// ---- timing ------------------------------------------------------------------------------------------------------------------------

const END_LEAD_MS = 800;

export function mbLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 250;
  MB_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === MB_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 380;
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

/** Gentle drift: the whole phone screen stays in view (zoom at most 1.06) so no animal or button is ever cropped. */
function drift(len: number, variant: number): CameraKey[] {
  const path: Array<[number, number]> = [[1.0, 0], [1.02, 6], [1.04, 10], [1.05, 8], [1.06, 4], [1.05, 0]];
  const dy = variant % 2 === 0 ? 1 : -1;
  return ascending(path.map(([z, off], i) => ({ t: Math.round((len * i) / (path.length - 1)), cx: 195, cy: Math.round(MB_PLATE.h / 2 + dy * off), zoom: z })), 120);
}

export type BuiltMbDemo = { timeline: Timeline; lineWords: Record<string, WordTime[]>; scenes: StageScene[] };

export function mbBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltMbDemo {
  const parsed = Object.fromEntries(MB_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(MB_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const clips = manifest.clips;
  if (!clips) throw new Error("Mibble Meadow needs its gameplay clips");

  const productLines = MB_NARRATION.filter((l) => l.sceneId !== "end");
  const spanStart = (k: number) => (k === 0 ? 0 : lt[productLines[k].id].start - 150);
  const spanEnd = (k: number) => (k + 1 < productLines.length ? spanStart(k + 1) : lt[productLines[k].id].end + 650);
  const bounds: Array<{ s: number; e: number }> = [];
  productLines.forEach((l, k) => {
    const mine = MB_BEATS.filter((b) => b.line === l.id);
    const a = spanStart(k);
    const b = spanEnd(k);
    mine.forEach((_, j) => bounds.push({ s: a + ((b - a) * j) / mine.length, e: a + ((b - a) * (j + 1)) / mine.length }));
  });
  if (bounds.length !== MB_BEATS.length) throw new Error("every beat must belong to a product line");
  const lastId = MB_NARRATION[MB_NARRATION.length - 1].id;
  const durationMs = lt[lastId].end + 1300;
  const endStart = bounds[bounds.length - 1].e - TRANSITION_MS;

  const scenes: StageScene[] = MB_BEATS.map((beat, i) => {
    const start = i === 0 ? 0 : bounds[i].s - TRANSITION_MS;
    const end = bounds[i].e;
    const len = end - start;
    const c = clips[beat.id];
    if (!c) throw new Error(`no footage for ${beat.id}`);
    if (len > (c.frames.length / c.fps) * 1000 + 60) throw new Error(`beat ${beat.id} (${Math.round(len)} ms) outruns its footage (${Math.round((c.frames.length / c.fps) * 1000)} ms)`);
    return {
      id: beat.id,
      kind: "screen" as const,
      start: Math.round(start),
      end: Math.round(end),
      plate: "play",
      states: [],
      clip: { frames: c.frames, fps: c.fps, from: 0 },
      camera: drift(Math.round(len), i),
      spots: [],
      ...(beat.headline ? { headline: { text: beat.headline, from: 60, to: Math.max(1100, Math.round(len * 0.8)) } } : {}),
    };
  });
  scenes.push({ id: "end", kind: "end", start: Math.round(endStart), end: durationMs, end_card: { headline: "How many can you clear?", button: MB_CTA.text, url: MB_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of MB_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = { play: { w: PLATE_CSS_W, h: MB_PLATE.h, states: {} } };
  return {
    timeline: {
      durationMs,
      // the whole phone screen at its own proportions (390 x 845 shown at 1.4x)
      win: { x: 267, y: 330, w: 546, h: 1180, r: 44 },
      brand: { name: "Mibble Meadow", accent: "#ff8c42", dark: "#3b2a1f", light: "#fff7ee", logo: manifest.logo, palette: { blobs: ["#6bcb86", "#ffd166"], endFrom: "#ff8c42", endMid: "#e86f2a", endTo: "#7a3b14", button: "#c2561a", ripple: "rgba(255,140,66,.25)" } },
      plates,
      scenes,
      captions,
    },
    lineWords,
    scenes,
  };
}
