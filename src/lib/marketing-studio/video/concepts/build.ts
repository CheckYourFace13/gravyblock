/**
 * Turns a stored Concept into a DemoSpec the existing renderer, voice, QA and review pipeline already accept: a generic capture that replays the concept's
 * real interaction path on the live product, and a generic timeline built from the personality profile (pace, gaps, zoom). Nothing here is product specific.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "playwright-core";
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "../demo/audio";
import type { BuiltDkDemo } from "../demo/drinkknird";
import { round, union, VIEW } from "../demo/plates";
import type { LineTime } from "../demo/rentalnoodle";
import type { DemoSpec } from "../demo/specs";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type CursorKey, type Manifest, type PlateManifest, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "../demo/types";
import { openBrowsed, openPage, tagControls } from "./browse";
import { personalityFor } from "./standard";
import type { Concept, PlatePlan } from "./types";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- capture -----------------------------------------------------------------------------------------------------------------------

async function rectOf(page: Page, sel: string): Promise<Rect> {
  const r = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height];
  }, sel);
  if (!r) throw new Error(`capture: ${sel} not found on ${page.url()}`);
  return [round(r[0]), round(r[1]), round(r[2]), round(r[3])];
}

const readLines = (page: Page, gid: string) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-gbg="${id}"]`);
    const root = el?.parentElement ?? el ?? document.body;
    return ((root as HTMLElement).innerText || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length >= 3);
  }, gid);

async function headRect(page: Page, heading: string, fallback: Rect): Promise<Rect> {
  if (!heading) return fallback;
  const r = await page.evaluate((h) => {
    const e = [...document.querySelectorAll("h1,h2,h3,h4")].find((x) => ((x as HTMLElement).innerText || "").replace(/\s+/g, " ").trim().startsWith(h));
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return [b.x, b.y + window.scrollY, b.width, b.height];
  }, heading.slice(0, 60));
  return r ? [round(r[0]), round(r[1]), round(r[2]), round(r[3])] : fallback;
}

export function captureConcept(c: Concept): DemoSpec["capture"] {
  return async (outDir, logoFile) => {
    await mkdir(outDir, { recursive: true });
    const b = await openBrowsed(c.origin);
    const capturedAt = new Date().toISOString();
    const plates: Record<string, PlateManifest> = {};
    try {
      const { page } = b;
      const click = async (idx: number) => {
        await page.locator(`[data-gbc="${idx}"]`).first().click({ timeout: 5000 });
        await page.waitForTimeout(420);
      };
      for (const pl of c.capturePlan) {
        const url = new URL(pl.path, c.origin).toString();
        const gid = pl.groupId.split("#").pop() as string;
        const load = async () => {
          await openPage(page, url);
          const groups = await tagControls(page);
          const g = groups.find((x) => x.id === gid);
          if (!g) throw new Error(`capture: the control group "${pl.heading}" is no longer on ${url}`);
          for (const cl of pl.clicks) {
            const found = g.controls.find((x) => x.index === cl.control);
            if (!found || norm(found.name) !== norm(cl.name)) throw new Error(`capture: control "${cl.name}" moved or changed on ${url}`);
          }
          for (const idx of pl.prefix) await click(idx);
        };
        const [a, bb] = pl.clicks;
        // pass 1: measure every state
        await load();
        const box0 = await rectOf(page, `[data-gbg="${gid}"]`);
        const cA = await rectOf(page, `[data-gbc="${a.control}"]`);
        const head = await headRect(page, pl.heading, cA);
        await click(a.control);
        const boxA = await rectOf(page, `[data-gbg="${gid}"]`);
        const cB = await rectOf(page, `[data-gbc="${bb.control}"]`);
        await click(bb.control);
        const boxB = await rectOf(page, `[data-gbg="${gid}"]`);
        const top = Math.min(head[1], box0[1], cA[1]);
        const bottom = Math.max(box0[1] + box0[3], boxA[1] + boxA[3], boxB[1] + boxB[3]);
        const y0 = Math.max(0, Math.round(top - 50));
        const h = Math.min(1150, Math.round(bottom + 60 - y0));
        // pass 2: the same clicks, with a picture and the newly shown text at every state
        await load();
        const shot = async (file: string) => {
          await writeFile(path.join(outDir, file), await page.screenshot({ type: "jpeg", quality: 92, fullPage: true, clip: { x: 0, y: y0, width: VIEW.w, height: h } }));
          return file;
        };
        const states: PlateManifest["states"] = {};
        let prev = new Set(await readLines(page, gid));
        states.s0 = { file: await shot(`${pl.id}-s0.jpg`), label: `${pl.heading || "Page"}, before` };
        const step = async (key: "a" | "b", idx: number, name: string, want: string) => {
          await click(idx);
          const now = await readLines(page, gid);
          const fresh = now.filter((l) => !prev.has(l));
          prev = new Set(now);
          const result = fresh.map(clean).join(" | ");
          if (!norm(result).includes(norm(want))) throw new Error(`capture: after "${name}" the page no longer shows "${want.slice(0, 50)}"`);
          states[key] = { file: await shot(`${pl.id}-${key}.jpg`), label: `After ${name}`, result };
        };
        await step("a", a.control, a.name, a.payoff);
        await step("b", bb.control, bb.name, bb.payoff);
        const o = (r: Rect): Rect => [r[0], round(r[1] - y0), r[2], r[3]];
        const text = await page.evaluate(() => document.body.innerText);
        const seen = Object.values(states).map((s) => s.result ?? "").join(" ");
        plates[pl.id] = { id: pl.id, url, title: await page.title(), capturedAt: new Date().toISOString(), text: `${text} ${seen}`, w: VIEW.w, h, states, rects: { head: o(head), box0: o(box0), cA: o(cA), cB: o(cB), boxA: o(boxA), boxB: o(boxB), both: o(union(cA, boxB)) } };
      }
    } finally {
      await b.close();
    }
    const manifest: Manifest = { capturedAt, viewport: VIEW, plates, logo: path.basename(logoFile) };
    await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  };
}

// ---- timeline ----------------------------------------------------------------------------------------------------------------------

const center = (r: Rect): [number, number] => [r[0] + r[2] / 2, r[1] + r[3] / 2];
function ascending<T extends { t: number }>(keys: T[], gap = 140): T[] {
  const out: T[] = [];
  for (const k of [...keys].sort((x, y) => x.t - y.t)) {
    const prev = out[out.length - 1];
    out.push(prev && k.t < prev.t + gap ? { ...k, t: prev.t + gap } : k);
  }
  return out;
}

export function layoutConcept(c: Concept) {
  const p = personalityFor(c.slug);
  return (durMs: Record<string, number>): Record<string, LineTime> => {
    const out: Record<string, LineTime> = {};
    let t = 300;
    c.narration.forEach((l, i) => {
      if (i > 0) t += l.sceneId === c.narration[i - 1].sceneId ? p.gaps.same : l.sceneId === "end" ? p.gaps.endLead : p.gaps.scene;
      const d = durMs[l.id];
      if (!d) throw new Error(`no audio duration for line ${l.id}`);
      out[l.id] = { start: t, end: t + d, durMs: d };
      t += d;
    });
    return out;
  };
}

function shade(hex: string, to: number, k: number) {
  const n = parseInt(hex.slice(1), 16);
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

export function buildConceptTimeline(c: Concept) {
  const p = personalityFor(c.slug);
  return (manifest: Manifest, lt: Record<string, LineTime>): BuiltDkDemo => {
    const parsed = Object.fromEntries(c.narration.map((l) => [l.id, parseSpoken(l.spoken)]));
    const spokenWords: Record<string, WordTime[]> = Object.fromEntries(c.narration.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
    const mt = (marker: string) => {
      const line = c.narration.find((l) => parsed[l.id].markers[marker] !== undefined);
      if (!line) throw new Error(`marker ${marker} missing`);
      return lt[line.id].start + spokenWords[line.id][parsed[line.id].markers[marker]].from;
    };
    const lastLine = c.narration[c.narration.length - 1];
    const order = c.capturePlan.map((_, i) => `a${i + 1}`);
    const lastEnd = (scene: string) => Math.max(...c.narration.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
    const win: Record<string, { s: number; e: number }> = {};
    order.forEach((id, i) => {
      win[id] = { s: i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS, e: lastEnd(id) + (i === order.length - 1 ? 1300 : 600) };
    });
    const endStart = win[order[order.length - 1]].e - TRANSITION_MS;
    const durationMs = lt[lastLine.id].end + 1500;
    const scenes: StageScene[] = [];

    c.capturePlan.forEach((pl: PlatePlan, i) => {
      const id = `a${i + 1}`;
      const P = manifest.plates[pl.id];
      const S = win[id].s;
      const r = (abs: number) => Math.max(0, abs - S);
      const E = win[id].e - S;
      const tA = r(mt(`a${i + 1}`));
      const tB = r(mt(`b${i + 1}`));
      const rc = P.rects;
      const hookEnd = i === 0 ? r(lt[c.narration[0].id].end) : 0;
      const states = [{ at: 0, state: "s0" }, { at: tA + 120, state: "a" }, { at: tB + 120, state: "b" }];
      const cursor: CursorKey[] = ascending([
        { t: 250, x: 330, y: center(rc.cA)[1] - 110 },
        { t: tA - 320, x: center(rc.cA)[0], y: center(rc.cA)[1] },
        { t: tA, x: center(rc.cA)[0], y: center(rc.cA)[1], tap: true },
        { t: tB - 360, x: center(rc.cB)[0], y: center(rc.cB)[1] },
        { t: tB, x: center(rc.cB)[0], y: center(rc.cB)[1], tap: true },
        { t: E - 300, x: center(rc.cB)[0], y: center(rc.cB)[1], hide: true },
      ]);
      const camera: CameraKey[] = ascending([
        { t: 0, cx: 195, cy: center(rc.head)[1] + 90, zoom: p.zoom.rest },
        { t: tA - 450, cx: 195, cy: center(rc.cA)[1], zoom: p.zoom.rest },
        { t: tA + 500, cx: 195, cy: center(rc.boxA)[1], zoom: p.zoom.tap },
        { t: tB - 350, cx: 195, cy: center(rc.cB)[1], zoom: p.zoom.rest + 0.02 },
        { t: tB + 500, cx: 195, cy: center(rc.boxB)[1], zoom: p.zoom.tap },
        { t: E, cx: 195, cy: center(rc.boxB)[1] + 30, zoom: p.zoom.tap + 0.02 },
      ], 220);
      const spots: SpotKey[] = [
        { from: Math.max(0, tA - 150), to: Math.max(tA + 700, tA - 100), rect: rc.cA, label: pl.clicks[0].name },
        { from: tA + 750, to: Math.max(tA + 1400, tB - 450), rect: rc.boxA },
        { from: Math.max(tA + 760, tB - 150), to: Math.max(tB + 700, tA + 1500), rect: rc.cB, label: pl.clicks[1].name },
        { from: Math.max(tA + 1600, tB + 750), to: Math.max(tB + 1500, E - 250), rect: rc.boxB },
      ];
      scenes.push({ id, kind: "screen", start: S, end: win[id].e, plate: pl.id, states, camera, cursor, spots, headline: { text: c.headlines[id], from: 60, to: Math.max(1500, i === 0 ? hookEnd + 400 : tA - 150) } });
    });
    scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: c.headlines.end, button: c.cta.text, url: c.cta.display } });

    const lineWords: Record<string, WordTime[]> = {};
    const captions: Timeline["captions"] = [];
    for (const l of c.narration) {
      const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
      lineWords[l.id] = spokenWords[l.id];
      captions.push(...groupCaptions(words, lt[l.id].start));
    }
    const plates: Timeline["plates"] = {};
    for (const pl of c.capturePlan) {
      const m = manifest.plates[pl.id];
      plates[pl.id] = { w: PLATE_CSS_W, h: m.h, states: Object.fromEntries(Object.entries(m.states).map(([k, s]) => [k, s.file])) };
    }
    const a = c.brand.accent;
    return {
      timeline: { durationMs, brand: { name: c.brand.name, accent: a, dark: c.brand.dark, light: c.brand.light, logo: manifest.logo, palette: { blobs: [shade(a, 255, 0.45), c.brand.dark], endFrom: a, endMid: shade(a, 0, 0.35), endTo: c.brand.dark, button: shade(a, 0, 0.18), ripple: `rgba(${parseInt(a.slice(1, 3), 16)},${parseInt(a.slice(3, 5), 16)},${parseInt(a.slice(5, 7), 16)},.25)` } }, plates, scenes, captions },
      lineWords,
      scenes,
    };
  };
}

/** The DemoSpec for a concept: the existing pipeline renders it like any other video. */
export function specFromConcept(c: Concept): DemoSpec {
  const p = personalityFor(c.slug);
  const angle = c.specId.includes(":") ? c.specId.split(":")[1] : undefined;
  return {
    slug: c.slug,
    productName: c.productName,
    angle,
    site: { origin: c.origin, ctaText: c.cta.text, ctaHost: c.ctaHost },
    title: c.title,
    cta: { text: c.cta.text, url: c.cta.url, display: c.cta.display },
    narration: c.narration,
    claims: c.claims,
    facts: c.facts,
    onScreen: c.onScreen,
    sceneMeta: c.sceneMeta,
    capture: captureConcept(c),
    layout: layoutConcept(c),
    build: buildConceptTimeline(c),
    pace: p.pace,
    music: p.music,
    concept: c,
  };
}
