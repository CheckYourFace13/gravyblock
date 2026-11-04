/**
 * The DrinkKnird demo: script, claims, and the timeline that ties every action on screen to the word being spoken.
 * Everything shown is a real state of the public site (the recipe page's own "Scale servings" control, the measurement converter, a real
 * history page and the home page); everything said traces to a verified Product Truth fact and a quote that is on the captured page.
 * Nothing here describes a feature the public pages do not describe.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type CursorKey, type Manifest, type NarrationLine, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const DK_TITLE = "DrinkKnird: scale a classic cocktail, convert, and learn where it came from";
export const DK_CTA = { text: "Browse recipes", url: "https://drinkknird.com/all-recipes", display: "drinkknird.com" };

/** "Knird" is read "nerd" by the voice; the caption and end card always spell the name DrinkKnird. */
export const DK_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "scale", spoken: "Making a Negroni for the whole party?", claims: ["c-scale"] },
  { id: "L2", sceneId: "scale", spoken: "Change {serv}the servings, and Drink Nerd {amts}scales every ingredient amount.", caption: "Change the servings, and DrinkKnird scales every ingredient amount.", claims: ["c-scale"] },
  { id: "L3", sceneId: "convert", spoken: "Need a conversion? Switch {from}cups to {oz}ounces, or flip oven {temp}temperatures.", claims: ["c-convert"] },
  { id: "L4", sceneId: "story", spoken: "Then read the {story}story behind the drink, with its {docs}documented origins and {disp}disputed claims.", claims: ["c-story"] },
  { id: "L5", sceneId: "home", spoken: "Browse {rec}recipes, see what's {hot}hot, find {ev}events, and use kitchen {tools}tools.", claims: ["c-home"] },
  { id: "L6", sceneId: "end", spoken: "Drink, cook, and discover something new, at Drink Nerd dot com.", caption: "Drink, cook, and discover something new at DrinkKnird.com", claims: ["c-cta"] },
];

export const DK_CLAIMS: Claim[] = [
  { id: "c-scale", text: "A DrinkKnird recipe page, such as the Classic Negroni, has a Scale servings control that scales the ingredient amounts.", facts: ["Scales ingredient amounts only."], sources: [{ plate: "negroni", quote: "Classic Negroni" }, { plate: "negroni", quote: "Scale servings" }, { plate: "negroni", quote: "Scales ingredient amounts only." }, { plate: "negroni", quote: "1 ounce (30 ml) Campari" }] },
  { id: "c-convert", text: "The kitchen measurement converter handles tsp, tbsp, cups, fluid ounces, ml, and oven temperature in Fahrenheit and Celsius.", facts: ["Convert tsp, tbsp, cups, fluid ounces, ml, and oven °F/°C."], sources: [{ plate: "tools", quote: "Convert tsp, tbsp, cups, fluid ounces, ml, and oven °F/°C." }, { plate: "converter", quote: "Oven temperature" }, { plate: "converter", quote: "Result:" }] },
  { id: "c-story", text: "DrinkKnird's history page explores the documented origins and disputed stories behind the Negroni.", facts: ["documented origins and disputed stories behind the Negroni"], sources: [{ plate: "story", quote: "documented origins and disputed stories behind the Negroni" }, { plate: "story", quote: "Documented origin claims" }] },
  { id: "c-home", text: "The home page offers homemade recipes and cocktails, what is trending in food culture, events and kitchen and bar tools.", facts: ["Homemade recipes and cocktails"], sources: [{ plate: "home", quote: "Homemade recipes and cocktails, plus a clear look at what's cooking in food culture" }, { plate: "home", quote: "Browse recipes" }] },
  { id: "c-cta", text: "The home page's tagline is Drink, Cook, Discover Something New, with a Browse recipes call to action.", facts: ["Drink, Cook, Discover Something New"], sources: [{ plate: "home", quote: "Drink, Cook, Discover Something New" }, { plate: "home", quote: "Browse recipes" }] },
];

/** Product Truth facts this video needs. Each is added only if its exact text is on the live page it cites. */
export const DK_FACTS: Array<{ plate: string; value: string }> = [
  { plate: "negroni", value: "Scales ingredient amounts only." },
  { plate: "negroni", value: "IBA-aligned Negroni: 1 oz each gin, Campari, and sweet vermouth" },
  { plate: "tools", value: "Convert tsp, tbsp, cups, fluid ounces, ml, and oven °F/°C." },
  { plate: "story", value: "Explore the documented origins and disputed stories behind the Negroni cocktail and its association with Florence." },
  { plate: "home", value: "Homemade recipes and cocktails, plus a clear look at what's cooking in food culture—trends, stories, and events worth knowing about." },
  { plate: "home", value: "Drink, Cook, Discover Something New" },
];

export const DK_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "scale", kind: "headline", text: "Cocktails for a crowd?", claim: "c-scale" },
  { sceneId: "scale", kind: "label", text: "Servings", claim: "c-scale" },
  { sceneId: "scale", kind: "label", text: "Scaled ingredients", claim: "c-scale" },
  { sceneId: "convert", kind: "headline", text: "Quick conversions", claim: "c-convert" },
  { sceneId: "convert", kind: "label", text: "Cups to ounces", claim: "c-convert" },
  { sceneId: "convert", kind: "label", text: "Oven °C to °F", claim: "c-convert" },
  { sceneId: "story", kind: "headline", text: "The story behind it", claim: "c-story" },
  { sceneId: "story", kind: "label", text: "Documented origins", claim: "c-story" },
  { sceneId: "story", kind: "label", text: "Disputed claims", claim: "c-story" },
  { sceneId: "home", kind: "headline", text: "Recipes, trends, events", claim: "c-home" },
  { sceneId: "end", kind: "headline", text: "Drink, cook, discover something new.", claim: "c-cta" },
  { sceneId: "end", kind: "cta", text: "Browse recipes", claim: "c-cta" },
];

export const DK_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  scale: { plate: "negroni", purpose: "Hook and first demonstration: the Classic Negroni recipe, scaled for a party with the page's own control.", motion: ["touch cursor moves and taps the servings field", "servings change 1, 2, 4, 8 and every ingredient amount updates live", "camera pushes in on the servings, then the ingredients", "focus highlight on the scaled ingredients"], note: "Real states of the Classic Negroni recipe page, produced by changing the Scale servings field on the live page." },
  convert: { plate: "converter", purpose: "Second tool: the real measurement converter for volume and oven temperature.", motion: ["cursor taps the amount, then the unit controls", "amount, ounces and Celsius states change with live results", "camera pushes down from volume to oven temperature", "focus highlight on each live result"], note: "Real states of the kitchen measurement converter after changing the amount, the target unit and the oven temperature." },
  story: { plate: "story", purpose: "Depth: a real DrinkKnird history page, with documented origins and the disputed claims.", motion: ["camera scrolls down the real story page", "focus highlight on the documented origins section", "focus highlight on the disputed-claims paragraph", "a label pops in on each highlight"], note: "Real capture of the top of drinkknird.com/origins-of-the-negroni." },
  home: { plate: "home", purpose: "Where to find more: recipes, what's hot, events and tools.", motion: ["camera pans down the real home page", "focus highlight steps through recipes, what's hot, events and tools as each is spoken", "headline springs in and out", "captions follow the voice"], note: "Real capture of the top of drinkknird.com." },
  end: { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no product screen is claimed." },
};

// ---- timing ------------------------------------------------------------------------------------------------------------------------

const HOME_TAIL_MS = 1200;
const END_LEAD_MS = 1350;

export function dkLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 300;
  DK_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === DK_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 450;
    const d = durMs[l.id];
    if (!d) throw new Error(`no audio duration for line ${l.id}`);
    out[l.id] = { start: t, end: t + d, durMs: d };
    t += d;
  });
  return out;
}

const center = (r: Rect): [number, number] => [r[0] + r[2] / 2, r[1] + r[3] / 2];

function ascending<T extends { t: number }>(keys: T[], gap = 140): T[] {
  const out: T[] = [];
  for (const k of keys.sort((a, b) => a.t - b.t)) {
    const prev = out[out.length - 1];
    out.push(prev && k.t < prev.t + gap ? { ...k, t: prev.t + gap } : k);
  }
  return out;
}

export type BuiltDkDemo = { timeline: Timeline; lineWords: Record<string, WordTime[]>; scenes: StageScene[] };

export function dkBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltDkDemo {
  const plate = (id: string) => manifest.plates[id];
  const parsed = Object.fromEntries(DK_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(DK_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };

  const order = ["scale", "convert", "story", "home"];
  const lastEnd = (scene: string) => Math.max(...DK_NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "home" ? HOME_TAIL_MS : 400) };
  });
  const endStart = win.home.e - TRANSITION_MS;
  const durationMs = lt.L6.end + 1500;
  const scenes: StageScene[] = [];

  // ---- scale the Negroni ----
  {
    const P = plate("negroni");
    const S = win.scale.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.scale.e - S;
    const sv = center(P.rects.servings);
    const ing = center(P.rects.ingredients);
    const tap = r(mt("L2", "serv")) - 160;
    const amts = r(mt("L2", "amts"));
    const states = [{ at: 0, state: "s0" }, { at: tap + 260, state: "v2" }, { at: tap + 600, state: "v4" }, { at: tap + 940, state: "v8" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: sv[1] - 120 },
      { t: tap - 300, x: sv[0] + 10, y: sv[1] },
      { t: tap, x: sv[0] + 10, y: sv[1], tap: true },
      { t: amts - 100, x: ing[0] + 110, y: ing[1] + 6 },
      { t: E - 300, x: ing[0] + 110, y: ing[1] + 6, hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: sv[1] + 40, zoom: 1.0 },
      { t: tap - 500, cx: 195, cy: sv[1] + 60, zoom: 1.07 },
      { t: amts - 300, cx: 195, cy: ing[1], zoom: 1.1 },
      { t: E, cx: 195, cy: ing[1] + 4, zoom: 1.1 },
    ], 200);
    const spots: SpotKey[] = [
      { from: tap - 120, to: Math.max(tap + 500, amts - 260), rect: P.rects.servings, label: "Servings" },
      { from: amts - 120, to: E - 250, rect: P.rects.ingredients, label: "Scaled ingredients" },
    ];
    scenes.push({ id: "scale", kind: "screen", start: S, end: win.scale.e, plate: "negroni", states, camera, cursor, spots, headline: { text: "Cocktails for a crowd?", from: 60, to: r(lt.L1.end) + 260 } });
  }

  // ---- converter ----
  {
    const P = plate("converter");
    const S = win.convert.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.convert.e - S;
    const amtC = center(P.rects.amount);
    const toC = center(P.rects.to);
    const unitC = center(P.rects.unit);
    const tempC = center(P.rects.temp);
    const vr = center(P.rects.volumeResult);
    const tr = center(P.rects.tempResult);
    const tFrom = r(mt("L3", "from"));
    const tOz = r(mt("L3", "oz"));
    const tTemp = r(mt("L3", "temp"));
    const states = [{ at: 0, state: "s0" }, { at: tFrom + 160, state: "a4" }, { at: tOz + 200, state: "oz" }, { at: tTemp + 200, state: "uC" }, { at: tTemp + 760, state: "t180" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: amtC[1] - 90 },
      { t: tFrom - 260, x: amtC[0] + 20, y: amtC[1] },
      { t: tFrom, x: amtC[0] + 20, y: amtC[1], tap: true },
      { t: tOz - 300, x: toC[0] + 40, y: toC[1] },
      { t: tOz, x: toC[0] + 40, y: toC[1], tap: true },
      { t: tTemp - 340, x: unitC[0] + 40, y: unitC[1] },
      { t: tTemp, x: unitC[0] + 40, y: unitC[1], tap: true },
      { t: tTemp + 520, x: tempC[0] + 20, y: tempC[1], tap: true },
      { t: E - 300, x: tr[0] + 90, y: tr[1] + 4, hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: amtC[1] + 60, zoom: 1.0 },
      { t: tFrom - 420, cx: 195, cy: amtC[1] + 90, zoom: 1.06 },
      { t: tOz - 300, cx: 195, cy: vr[1] + 20, zoom: 1.08 },
      { t: tTemp - 340, cx: 195, cy: unitC[1] + 20, zoom: 1.08 },
      { t: tTemp + 500, cx: 195, cy: tr[1] - 10, zoom: 1.1 },
      { t: E, cx: 195, cy: tr[1] - 8, zoom: 1.1 },
    ], 200);
    const spots: SpotKey[] = [
      { from: tOz + 150, to: tTemp - 380, rect: P.rects.volumeResult, label: "Cups to ounces" },
      { from: tTemp + 900, to: E - 250, rect: P.rects.tempResult, label: "Oven °C to °F" },
    ];
    scenes.push({ id: "convert", kind: "screen", start: S, end: win.convert.e, plate: "converter", states, camera, cursor, spots, headline: { text: "Quick conversions", from: 60, to: Math.max(1500, tFrom - 80) } });
  }

  // ---- story ----
  {
    const P = plate("story");
    const S = win.story.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.story.e - S;
    const a = r(mt("L4", "story"));
    const b = r(mt("L4", "docs"));
    const c = r(mt("L4", "disp"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 240, zoom: 1.0 },
      { t: a - 200, cx: 195, cy: center(P.rects.intro)[1] + 30, zoom: 1.04 },
      { t: b - 200, cx: 195, cy: center(P.rects.docs)[1] + 90, zoom: 1.04 },
      { t: c - 200, cx: 195, cy: center(P.rects.disputed)[1] - 20, zoom: 1.04 },
      { t: E, cx: 195, cy: center(P.rects.disputed)[1] - 16, zoom: 1.04 },
    ], 220);
    const spots: SpotKey[] = [
      { from: b - 160, to: c - 180, rect: P.rects.docs, label: "Documented origins" },
      { from: c - 140, to: E - 300, rect: P.rects.disputed, label: "Disputed claims" },
    ];
    scenes.push({ id: "story", kind: "screen", start: S, end: win.story.e, plate: "story", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "The story behind it", from: 60, to: Math.max(1500, b - 160) } });
  }

  // ---- home ----
  {
    const P = plate("home");
    const S = win.home.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.home.e - S;
    const items: Array<[string, string, string]> = [["rec", "recipes", "Recipes"], ["hot", "whatsHot", "What's Hot"], ["ev", "events", "Events"], ["tools", "tools", "Tools"]];
    const times = items.map(([m]) => r(mt("L5", m)));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.heading)[1] + 40, zoom: 1.0 },
      ...items.map(([, rect], i) => ({ t: times[i] - 200, cx: 195, cy: center(P.rects[rect])[1] + 30, zoom: 1.05 })),
      { t: E, cx: 195, cy: center(P.rects.tools)[1] + 30, zoom: 1.05 },
    ], 220);
    const spots: SpotKey[] = items.map(([, rect], i) => ({ from: times[i] - 160, to: i + 1 < items.length ? times[i + 1] - 140 : E - 300, rect: P.rects[rect], label: undefined }));
    scenes.push({ id: "home", kind: "screen", start: S, end: win.home.e, plate: "home", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Recipes, trends, events", from: 60, to: Math.max(1500, times[0] - 160) } });
  }

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "Drink, cook, discover something new.", button: DK_CTA.text, url: DK_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of DK_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = {};
  for (const id of ["negroni", "converter", "story", "home"]) {
    const p = plate(id);
    plates[id] = { w: PLATE_CSS_W, h: p.h, states: Object.fromEntries(Object.entries(p.states).map(([k, s]) => [k, s.file])) };
  }
  return {
    timeline: { durationMs, brand: { name: "DrinkKnird", accent: "#246bfd", dark: "#10233f", light: "#eef4ff", logo: manifest.logo, palette: { blobs: ["#38bdf8", "#6366f1"], endFrom: "#246bfd", endMid: "#1d4fc4", endTo: "#10233f", button: "#1d4fc4", ripple: "rgba(36,107,253,.25)" } }, plates, scenes, captions },
    lineWords,
    scenes,
  };
}
