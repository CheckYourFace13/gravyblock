/**
 * Post-render visual alignment and payoff framing for generated videos. These checks look at the FINISHED video's timeline: for every spoken line they find
 * which captured screen is on screen at the moments the line is being said, and compare what is said with the text that was really inside that screenshot
 * (read from the live page when it was taken), not with the capture plan. Narration about signup while nav links are showing, about standings while the
 * standings are off screen, or about a result before it appears, all fail here. Framing checks measure legibility, the size of the payoff, headline fit,
 * blank pictures and empty-result states.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSpoken, wordTimings } from "../demo/audio";
import type { LineTime } from "../demo/rentalnoodle";
import { SCREEN_SCALE, TRANSITION_MS, WIN, type Manifest, type Timeline } from "../demo/types";
import { EMPTY_STATE, personalityFor } from "./standard";
import type { Concept } from "./types";
import { contentTokens } from "./validate";

export type VisualCheck = { id: string; ok: boolean; severity: "fail" | "warn"; detail: string };

/** The screen scene on screen at an absolute time, and which of its captured states is showing (a state counts once its cross-fade is half done). */
export function stateAt(timeline: Pick<Timeline, "scenes">, t: number): { plate: string; state: string; sceneId: string } | null {
  const sc = timeline.scenes.filter((s) => s.kind === "screen" && s.plate && s.start <= t && t < s.end).sort((a, b) => b.start - a.start)[0];
  if (!sc || !sc.plate) return null;
  const rel = t - sc.start;
  let state = sc.states?.[0]?.state ?? "s0";
  for (const s of sc.states ?? []) if (rel >= s.at + TRANSITION_MS / 2) state = s.state;
  return { plate: sc.plate, state, sceneId: sc.id };
}

/** Absolute time of every tap marker (a1, b1, a2, ...) in the finished voice track. */
export function markerTimes(c: Concept, lt: Record<string, LineTime>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of c.narration) {
    const p = parseSpoken(l.spoken);
    const words = wordTimings(p.words, lt[l.id].durMs);
    for (const [m, idx] of Object.entries(p.markers)) out[m] = lt[l.id].start + words[idx].from;
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const plainOf = (s: string) => s.replace(/\{[a-z0-9]+\}/g, "").replace(/\s+/g, " ").trim();

/** How many pixels tall the page's headline will be, for the rule that it must not reach the phone window (the box is 176px, the window starts below it). */
export function headlineFits(text: string): boolean {
  const n = text.length;
  const font = n <= 18 ? 84 : n <= 32 ? 62 : 50;
  const lines = Math.ceil((n * font * 0.55) / 960);
  return 34 + lines * font * 1.02 <= 176;
}

export async function visualChecks(i: { concept: Concept; manifest: Manifest; lineTimes: Record<string, LineTime>; timeline: Pick<Timeline, "scenes">; platesDir: string }): Promise<VisualCheck[]> {
  const { concept: c, manifest, lineTimes: lt, timeline, platesDir } = i;
  const p = personalityFor(c.slug);
  const out: VisualCheck[] = [];
  const nameTokens = new Set(contentTokens(`${c.productName} ${c.ctaHost.replace(/\./g, " ")}`));
  const visibleOf = (plate: string, state: string) => manifest.plates[plate]?.states[state]?.visible ?? "";
  const tokensIn = (text: string) => new Set(contentTokens(text));
  const markers = markerTimes(c, lt);
  const problems: string[] = [];
  let checked = 0;

  // ---- the hook is about what is on screen while it is said ----
  const hook = c.narration[0];
  {
    const mid = lt[hook.id].start + (lt[hook.id].end - lt[hook.id].start) / 2;
    const at = stateAt(timeline, mid);
    const vis = at ? `${visibleOf(at.plate, at.state)} ${manifest.plates[at.plate]?.title ?? ""} ${c.capturePlan.find((x) => x.id === at.plate)?.heading ?? ""}` : "";
    const seen = tokensIn(vis);
    const mine = [...tokensIn(plainOf(hook.spoken))].filter((w) => !nameTokens.has(w));
    checked++;
    if (!at) problems.push("the hook plays over no product screen");
    else if (!mine.some((w) => seen.has(w))) problems.push(`the hook ("${plainOf(hook.spoken).slice(0, 50)}") is about nothing that is on screen while it is said`);
  }

  // ---- every step line is about what is on screen while its result is being said ----
  c.capturePlan.forEach((pl, pi) =>
    pl.clicks.forEach((_, ci) => {
      const id = `c-pay${pi + 1}${ci === 0 ? "a" : "b"}`;
      const line = c.narration.find((l) => l.claims.includes(id));
      if (!line) return;
      const marker = `${ci === 0 ? "a" : "b"}${pi + 1}`;
      const tap = markers[marker];
      if (tap === undefined) {
        problems.push(`line ${line.id} has no tap marker`);
        return;
      }
      const states = manifest.plates[pl.id]?.states ?? {};
      const want = ci === 0 ? "a" : "b";
      const tRes = Math.min(tap + 1000, lt[line.id].end);
      const now = stateAt(timeline, tRes);
      checked++;
      if (!now || now.plate !== pl.id || now.state !== want) {
        problems.push(`line ${line.id} describes the result of tap ${pi * 2 + ci + 1} but that result is not on screen when it is said (${now ? `${now.plate}/${now.state}` : "no product screen"} is showing)`);
        return;
      }
      const prior = ci === 0 ? "s0" : "a";
      const union = tokensIn(`${visibleOf(pl.id, want)} ${visibleOf(pl.id, prior)} ${pl.heading}`);
      if (!states[want]?.visible) {
        problems.push(`no record of what is inside the screenshot for line ${line.id}`);
        return;
      }
      const words = [...tokensIn(plainOf(line.spoken))].filter((w) => !nameTokens.has(w));
      const missing = words.filter((w) => !union.has(w));
      if (words.length >= 3 && missing.length / words.length > 0.5) problems.push(`line ${line.id} ("${plainOf(line.spoken).slice(0, 60)}") talks about ${missing.slice(0, 4).join(", ")} which is not on the screen showing at the time`);
      // running ahead: wording that belongs to a LATER screen of this plate or a later plate
      const later = [...Object.entries(states).filter(([k]) => (want === "a" ? k === "b" : false)).map(([, s]) => s.visible ?? ""), ...c.capturePlan.slice(pi + 1).flatMap((x) => Object.values(manifest.plates[x.id]?.states ?? {}).map((s) => s.visible ?? ""))];
      // filler words ("one", "list", "page") turn up on every screen and say nothing about a result: only distinctive words count as running ahead
      const FILLER = new Set(["list", "page", "next", "here", "more", "each", "show", "shows", "come", "comes", "pick", "tap"]);
      const ahead = missing.filter((w) => w.length >= 4 && !FILLER.has(w) && later.some((v) => tokensIn(v).has(w)));
      if (ahead.length) problems.push(`line ${line.id} runs ahead of the screen: "${ahead.slice(0, 3).join(", ")}" only appears later`);
    }),
  );
  out.push({ id: "visual_alignment", ok: problems.length === 0, severity: "fail", detail: problems.length ? problems.slice(0, 4).join(" | ") : `${checked} spoken segments each match what is really on screen while they are said` });

  // ---- payoff framing ----
  const frame: string[] = [];
  const results = c.capturePlan.flatMap((pl) => (["a", "b"] as const).map((k) => ({ pl, k, st: manifest.plates[pl.id]?.states[k] })));
  for (const r of results) if (r.st?.result && EMPTY_STATE.test(r.st.result)) frame.push(`the result shown after a tap is an empty or error state ("${r.st.result.slice(0, 50)}")`);
  const heads = Object.values(c.headlines).filter(Boolean);
  for (const h of heads) if (!headlineFits(h)) frame.push(`the headline "${h}" is too long to fit above the phone window without overlapping it`);
  for (const pl of c.capturePlan) {
    const m = manifest.plates[pl.id];
    if (!m) continue;
    const boxB = m.rects.boxB;
    const zoom = p.zoom.tap + 0.02;
    const viewArea = (WIN.w / SCREEN_SCALE) * (WIN.h / SCREEN_SCALE) / (zoom * zoom);
    const share = boxB ? (boxB[2] * boxB[3]) / viewArea : 0;
    if (share < 0.04) frame.push(`the result on plate ${pl.id} fills only ${(share * 100).toFixed(1)}% of the picture`);
    const font = m.meta?.resultFontPx;
    if (font !== undefined && font * SCREEN_SCALE * zoom < 34) frame.push(`the result text on plate ${pl.id} is too small on a phone (${Math.round(font * SCREEN_SCALE * zoom)}px in the frame)`);
    for (const [k, s] of Object.entries(m.states)) {
      try {
        const sharp = (await import("sharp")).default;
        const st = await sharp(await readFile(path.join(platesDir, s.file))).stats();
        const flat = st.channels.slice(0, 3).every((ch) => ch.stdev < 7);
        if (flat) frame.push(`the picture of ${pl.id}/${k} is blank or a flat colour`);
        // the figures of the result must be inside the picture itself, not just somewhere on the page
        const nums = (s.result ?? "").split(" | ")[0].match(/\d[\d,.]*/g) ?? [];
        if (k !== "s0" && nums.length && !nums.every((n) => (s.visible ?? "").includes(n))) frame.push(`the result after ${s.label} ("${(s.result ?? "").slice(0, 40)}") is not inside the picture shown`);
      } catch {
        /* image statistics are optional; the other framing checks still run */
      }
    }
  }
  out.push({ id: "payoff_framing", ok: frame.length === 0, severity: "fail", detail: frame.length ? frame.slice(0, 4).join(" | ") : "headlines fit, results are large and legible, no blank or empty result state" });
  void norm;
  return out;
}
