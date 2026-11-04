/**
 * The ScribbleZap video: REAL gameplay is the primary visual. Everything shown is footage of the game's own private web tester played by scripted
 * touch input; everything said is on the public product page (quoted and tied to verified Product Truth facts). Nothing is drawn, composited or
 * invented, and the game is not described beyond what its public page says.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import { SZ_PLATE } from "./scribblezap-capture";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type Manifest, type NarrationLine, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const SZ_TITLE = "ScribbleZap: real gameplay, cut a line and fill the page";
export const SZ_CTA = { text: "Coming soon", url: "https://iscreamstudio.com/games/scribblezap/", display: "scribblezap.com" };

/** The voice reads the names phonetically; captions and the end card spell ScribbleZap and iScream Studio. */
export const SZ_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "cut", spoken: "Cut a line. Keep the safe side. Fill the page.", claims: ["c-loop"] },
  { id: "L2", sceneId: "hold", spoken: "Tap and hold to cut across the board.", claims: ["c-hold"] },
  { id: "L3", sceneId: "claim", spoken: "Claim the side without the enemy, and keep {fill}filling until the page is yours.", claims: ["c-claim"] },
  { id: "L4", sceneId: "ideas", spoken: "New balls, hazards, and drawing tools show up one idea at a time.", claims: ["c-ideas"] },
  { id: "L4b", sceneId: "ideas", spoken: "Hand-crafted stages, then endless play after the campaign.", claims: ["c-endless"] },
  { id: "L5", sceneId: "end", spoken: "Scribble Zap. Coming soon from I Scream Studio.", caption: "ScribbleZap. Coming soon from iScream Studio. ScribbleZap.com", claims: ["c-genre", "c-cta"] },
];

const P = "public";
export const SZ_CLAIMS: Claim[] = [
  { id: "c-loop", text: "The public page's headline for the game is: Cut a line. Keep the safe side. Fill the page.", facts: ["Cut a line. Keep the safe side. Fill the page."], sources: [{ plate: P, quote: "Cut a line. Keep the safe side. Fill the page." }] },
  { id: "c-hold", text: "You tap and hold to cut across the board.", facts: ["Tap and hold to cut across the board."], sources: [{ plate: P, quote: "Tap and hold to cut across the board." }] },
  { id: "c-claim", text: "You claim the side without the enemy on it and keep filling until the page is yours.", facts: ["claim the side without the enemy on it, and keep filling until the page is yours"], sources: [{ plate: P, quote: "claim the side without the enemy on it, and keep filling until the page is yours" }] },
  { id: "c-ideas", text: "New balls, hazards, and drawing tools show up one idea at a time.", facts: ["New balls, hazards, and drawing tools show up one idea at a time."], sources: [{ plate: P, quote: "New balls, hazards, and drawing tools show up one idea at a time." }] },
  { id: "c-endless", text: "The stages are hand-crafted, with endless play after the campaign.", facts: ["then endless play after the campaign"], sources: [{ plate: P, quote: "then endless play after the campaign" }] },
  { id: "c-genre", text: "ScribbleZap is a draw-and-fill puzzle game from iScream Studio.", facts: ["A draw-and-fill puzzle game."], sources: [{ plate: P, quote: "A draw-and-fill puzzle game." }, { plate: P, quote: "ScribbleZap is a mobile puzzle game from iScream Studio." }] },
  { id: "c-cta", text: "The store listings are not live yet: Google Play and the App Store are both marked Coming Soon.", facts: ["Google Play — Coming Soon"], sources: [{ plate: P, quote: "Google Play — Coming Soon" }, { plate: P, quote: "App Store — Coming Soon" }] },
];

export const SZ_FACTS: Array<{ plate: string; value: string }> = [
  { plate: P, value: "Cut a line. Keep the safe side. Fill the page." },
  { plate: P, value: "Tap and hold to cut across the board." },
  { plate: P, value: "claim the side without the enemy on it, and keep filling until the page is yours" },
  { plate: P, value: "New balls, hazards, and drawing tools show up one idea at a time." },
  { plate: P, value: "then endless play after the campaign" },
  { plate: P, value: "A draw-and-fill puzzle game." },
  { plate: P, value: "Google Play — Coming Soon" },
];

export const SZ_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "cut", kind: "headline", text: "Cut a line.", claim: "c-loop" },
  { sceneId: "hold", kind: "headline", text: "Tap and hold", claim: "c-hold" },
  { sceneId: "claim", kind: "headline", text: "Fill the page", claim: "c-loop" },
  { sceneId: "claim", kind: "label", text: "Fill meter", claim: "c-claim" },
  { sceneId: "ideas", kind: "headline", text: "One idea at a time", claim: "c-ideas" },
  { sceneId: "ideas", kind: "label", text: "Endless play", claim: "c-endless" },
  { sceneId: "end", kind: "headline", text: "A draw-and-fill puzzle game.", claim: "c-genre" },
  { sceneId: "end", kind: "cta", text: "Coming soon", claim: "c-cta" },
];

export const SZ_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  cut: { plate: "play", purpose: "Hook: a real cut with the game's own combo burst, with the page's headline over it.", motion: ["real gameplay at about 50 fps: the pen draws a cut and the board fills", "the game's combo burst and particles", "slow camera push on the board", "kinetic headline"], note: "Footage of the private web tester (level 2), played by scripted touch input." },
  hold: { plate: "play", purpose: "How it plays: tap and hold, the pen draws across the board.", motion: ["real gameplay: tap and hold, the pen draws the first cut", "hatched territory appears behind the cut", "ball keeps bouncing", "camera drifts along the board"], note: "Footage of the private web tester (level 1), played by scripted touch input." },
  claim: { plate: "play", purpose: "Result: the cut claims the safe side, the fill passes its goal and the level clears.", motion: ["real gameplay: the cut that passes the 60 percent goal", "the game's own level clear card with stars and confetti", "focus highlight on the fill meter", "camera pushes toward the meter"], note: "Footage of the private web tester (level 1 to its LEVEL 1 CLEAR card)." },
  ideas: { plate: "play", purpose: "Progress: later levels, more cuts and combos.", motion: ["real gameplay on a later level: more cuts and combo bursts", "the fill meter climbs", "ball keeps bouncing", "camera drifts across the board"], note: "Footage of the private web tester (level 3), played by scripted touch input." },
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

/** Smooth camera drift over the whole scene: six keyframes so the footage is never framed identically twice. */
function drift(len: number, path: Array<[number, number]>): CameraKey[] {
  // Gentle on purpose: the push-in is halved and the framing stays high so the game's own HUD (pause, score, fill meter) is never cropped.
  return ascending(path.map(([cy, zoom], i) => {
    const z = 1 + (zoom - 1) * 0.5;
    return { t: Math.round((len * i) / (path.length - 1)), cx: 195, cy: Math.round(390 - (z - 1) * 300 + (cy - 440) * 0.3), zoom: Math.round(z * 1000) / 1000 };
  }), 150);
}

export type BuiltSzDemo = { timeline: Timeline; lineWords: Record<string, WordTime[]>; scenes: StageScene[] };

export function szBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltSzDemo {
  const parsed = Object.fromEntries(SZ_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(SZ_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };
  const clips = manifest.clips;
  if (!clips) throw new Error("ScribbleZap needs its gameplay clips");

  const order = ["cut", "hold", "claim", "ideas"] as const;
  const lastEnd = (scene: string) => Math.max(...SZ_NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "ideas" ? 700 : 350) };
  });
  const endStart = win.ideas.e - TRANSITION_MS;
  const durationMs = lt.L5.end + 1300;

  const scenes: StageScene[] = [];
  const clipFor = (id: string, from: number) => {
    const c = clips[id];
    if (!c) throw new Error(`no clip for ${id}`);
    return { frames: c.frames, fps: c.fps, from };
  };
  const length = (id: string) => win[id].e - win[id].s;
  const fits = (id: string, from: number) => {
    const c = clips[id];
    if (length(id) + from > (c.frames.length / c.fps) * 1000 + 60) throw new Error(`scene ${id} (${length(id)} ms) outruns its footage (${Math.round((c.frames.length / c.fps) * 1000)} ms)`);
  };

  // hook: footage starts mid-action (the cut is already being drawn at 0 ms)
  fits("cut", 0);
  scenes.push({ id: "cut", kind: "screen", start: win.cut.s, end: win.cut.e, plate: "play", states: [], clip: clipFor("cut", 0), camera: drift(length("cut"), [[430, 1.0], [440, 1.04], [450, 1.08], [450, 1.1], [445, 1.12], [440, 1.12]]), headline: { text: "Cut a line.", from: 40, to: Math.max(1500, lt.L1.end - win.cut.s + 200) } });

  fits("hold", 0);
  scenes.push({ id: "hold", kind: "screen", start: win.hold.s, end: win.hold.e, plate: "play", states: [], clip: clipFor("hold", 0), camera: drift(length("hold"), [[420, 1.04], [430, 1.08], [440, 1.1], [450, 1.12], [450, 1.12], [445, 1.1]]), headline: { text: "Tap and hold", from: 40, to: Math.max(1500, lt.L2.end - win.hold.s + 150) } });

  // claim: the fill meter is highlighted while "filling" is spoken, then the level clears
  fits("claim", 0);
  const fillAt = mt("L3", "fill") - win.claim.s;
  const spots: SpotKey[] = [{ from: Math.max(300, fillAt - 200), to: Math.min(length("claim") - 900, fillAt + 1800), rect: manifest.plates.play.rects.fill, label: "Fill meter" }];
  scenes.push({ id: "claim", kind: "screen", start: win.claim.s, end: win.claim.e, plate: "play", states: [], clip: clipFor("claim", 0), camera: drift(length("claim"), [[430, 1.0], [400, 1.05], [330, 1.1], [330, 1.1], [380, 1.08], [400, 1.06]]), spots, headline: { text: "Fill the page", from: 40, to: Math.max(1500, lt.L3.start - win.claim.s + 1500) } });

  fits("ideas", 0);
  scenes.push({ id: "ideas", kind: "screen", start: win.ideas.s, end: win.ideas.e, plate: "play", states: [], clip: clipFor("ideas", 0), camera: drift(length("ideas"), [[440, 1.0], [440, 1.05], [450, 1.1], [450, 1.12], [440, 1.1], [430, 1.06]]), headline: { text: "One idea at a time", from: 40, to: Math.max(1500, lt.L4.end - win.ideas.s - 200) }, spots: [{ from: lt.L4b.start - win.ideas.s - 100, to: lt.L4b.end - win.ideas.s - 100, rect: manifest.plates.play.rects.board, label: "Endless play" }] });

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "A draw-and-fill puzzle game.", button: SZ_CTA.text, url: SZ_CTA.display } });

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
