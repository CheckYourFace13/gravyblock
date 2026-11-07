/**
 * The TheDrinkPlace acquisition video: curiosity first ("heard about a drink you want to try?"), then two live searches on the real site, a real drink
 * page, and where the drink was seen on a menu. Everything shown is a real state of thedrinkplace.com at phone width; the searches are really typed
 * and submitted. The venue panel keeps the site's own caveat (a menu observation, not live stock). TheDrinkPlace is an adults-only drinks product, so the
 * script never encourages drinking, makes no price or availability promise, and says it is for adults 21 and over. Product-first: no parent branding.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import type { BuiltDkDemo } from "./drinkknird";
import type { LineTime } from "./rentalnoodle";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type CursorKey, type Manifest, type NarrationLine, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const TDP_TITLE = "TheDrinkPlace: search a drink, see what it is and where it was on a menu";
export const TDP_CTA = { text: "Search drinks", url: "https://thedrinkplace.com/search", display: "thedrinkplace.com" };

export const TDP_NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "search1", spoken: "Heard about a drink you want to try?", claims: ["c-search"] },
  { id: "L2", sceneId: "search1", spoken: "Search it, like a {q}Negroni, and see the drink with {rel}related cocktails.", claims: ["c-search"] },
  { id: "L3", sceneId: "search2", spoken: "Or search a {q}bottle, like {bt}Buffalo Trace, and find the {pr}product and {br}brand.", claims: ["c-bottle"] },
  { id: "L4", sceneId: "drink", spoken: "Each drink page shows {what}what it is, the {ing}ingredients, and how to make it.", claims: ["c-drink"] },
  { id: "L5", sceneId: "where", spoken: "Then see which {v}venues have had it on the menu, with the {src}source and date.", claims: ["c-where"] },
  { id: "L6", sceneId: "end", spoken: "Find your next great drink at thedrinkplace dot com. Adults, twenty-one and over.", caption: "Find your next great drink at thedrinkplace.com. Adults 21+.", claims: ["c-cta"] },
];

export const TDP_CLAIMS: Claim[] = [
  { id: "c-search", text: "TheDrinkPlace has a drink search; searching Negroni shows the drink and related cocktails.", facts: ["Search drinks"], sources: [{ plate: "search1", quote: "Search drinks" }, { plate: "search1", quote: "Negroni" }, { plate: "search1", quote: "Negroni Sbagliato" }, { plate: "search1", quote: "Related" }] },
  { id: "c-bottle", text: "Searching a bottle such as Buffalo Trace shows the product and its brand.", facts: ["Search drinks"], sources: [{ plate: "search2", quote: "Buffalo Trace · BOURBON" }, { plate: "search2", quote: "Products" }, { plate: "search2", quote: "Brands" }] },
  { id: "c-drink", text: "A drink page says what the drink is, lists the ingredients and explains how to make it.", facts: ["Equal parts gin, Campari, and sweet vermouth."], sources: [{ plate: "drink", quote: "What it is" }, { plate: "drink", quote: "Equal parts gin, Campari, and sweet vermouth." }, { plate: "drink", quote: "Ingredients" }, { plate: "drink", quote: "How to make it" }] },
  { id: "c-where", text: "A drink page lists venues where the drink was seen on a menu, with the source and date, and states that this does not mean the drink is in stock.", facts: ["A place listed here is a sourced menu observation with source and last-checked when available."], sources: [{ plate: "where", quote: "A place listed here is a sourced menu observation" }, { plate: "where", quote: "does not mean the drink is in stock today" }, { plate: "where", quote: "Source:" }, { plate: "where", quote: "On menu" }] },
  { id: "c-cta", text: "TheDrinkPlace helps you find your next great drink, and it is for adults 21 or older.", facts: ["Find your next great drink", "Confirm you are 21 or older."], sources: [{ plate: "home", quote: "Find your next great drink" }, { plate: "search1", quote: "Confirm you are 21 or older." }, { plate: "home", quote: "Search drinks" }] },
];

/** Product Truth facts this video needs. Each is added only if its exact text is on the live page it cites. */
export const TDP_FACTS: Array<{ plate: string; value: string }> = [
  { plate: "search1", value: "Search drinks" },
  { plate: "drink", value: "Equal parts gin, Campari, and sweet vermouth." },
  { plate: "where", value: "A place listed here is a sourced menu observation with source and last-checked when available." },
  { plate: "home", value: "Find your next great drink" },
  { plate: "search1", value: "Confirm you are 21 or older." },
];

export const TDP_ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "search1", kind: "headline", text: "Heard of a drink?", claim: "c-search" },
  { sceneId: "search1", kind: "label", text: "Search it", claim: "c-search" },
  { sceneId: "search1", kind: "label", text: "Related cocktails", claim: "c-search" },
  { sceneId: "search2", kind: "headline", text: "Or a bottle?", claim: "c-bottle" },
  { sceneId: "search2", kind: "label", text: "Product and brand", claim: "c-bottle" },
  { sceneId: "drink", kind: "headline", text: "What it is, how to make it", claim: "c-drink" },
  { sceneId: "drink", kind: "label", text: "Ingredients", claim: "c-drink" },
  { sceneId: "where", kind: "headline", text: "Seen on a menu", claim: "c-where" },
  { sceneId: "where", kind: "label", text: "Source and date", claim: "c-where" },
  { sceneId: "end", kind: "headline", text: "Find your next great drink.", claim: "c-cta" },
  { sceneId: "end", kind: "cta", text: "Search drinks", claim: "c-cta" },
];

export const TDP_SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  search1: { plate: "search1", purpose: "Hook and first demonstration: a live search for a cocktail on the real site.", motion: ["touch cursor taps the search box and the word Negroni is typed", "the results appear with the drink and related cocktails", "camera moves from the search box to the results", "focus highlight on the search box, then on the related cocktails"], note: "Real states of the thedrinkplace.com search page: opened, Negroni typed, results after the search." },
  search2: { plate: "search2", purpose: "Second live search: a bottle, to show products and brands, not only cocktails.", motion: ["touch cursor taps the search box and Buffalo Trace is typed", "the results show the product and the brand", "camera moves from the search box to the results", "focus highlight on the product, then on the brands"], note: "Real states of the thedrinkplace.com search page: opened, Buffalo Trace typed, results after the search." },
  drink: { plate: "drink", purpose: "Depth: a real drink page with what it is, the ingredients and how to make it.", motion: ["camera moves down the real drink page", "focus highlight on what the drink is", "focus highlight on the ingredients with a label", "headline springs in and out"], note: "Real capture of the top of thedrinkplace.com/drink/negroni." },
  where: { plate: "where", purpose: "Utility: where the drink was seen on a menu, with the source and date, and the site's own not-live-stock caveat.", motion: ["camera moves to the sourced venue listing", "focus highlight on the site's caveat about menu observations", "focus highlight on the source and date with a label", "headline springs in and out"], note: "Real capture of the Find near you section of thedrinkplace.com/drink/negroni (the third-party map is not loaded in the capture)." },
  end: { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no product screen is claimed." },
};

const END_LEAD_MS = 1350;

export function tdpLayoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 300;
  TDP_NARRATION.forEach((l, i) => {
    if (i > 0) t += l.sceneId === TDP_NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 450;
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

export function tdpBuildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltDkDemo {
  const plate = (id: string) => manifest.plates[id];
  const parsed = Object.fromEntries(TDP_NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(TDP_NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };

  const order = ["search1", "search2", "drink", "where"];
  const lastEnd = (scene: string) => Math.max(...TDP_NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "where" ? 1200 : 400) };
  });
  const endStart = win.where.e - TRANSITION_MS;
  const durationMs = lt.L6.end + 1500;
  const scenes: StageScene[] = [];

  // ---- a live search scene: tap the box, the query is typed, the results arrive ----
  const searchScene = (id: "search1" | "search2", line: string, typedMarker: string, resultsMarker: string, resRect: string, spotA: { rect: string; label: string }, spotB: { rect: string; label: string }, headline: string, headlineEndLine: string) => {
    const P = plate(id);
    const S = win[id].s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win[id].e - S;
    const inC = center(P.rects.input);
    const tType = r(mt(line, typedMarker));
    const tRes = r(mt(line, resultsMarker));
    const a = P.rects[resRect];
    const b = P.rects[spotB.rect];
    const states = [{ at: 0, state: "s0" }, { at: tType + 80, state: "typed" }, { at: tRes - 120, state: "results" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: inC[1] - 90 },
      { t: tType - 420, x: inC[0] + 30, y: inC[1] },
      { t: tType - 160, x: inC[0] + 30, y: inC[1], tap: true },
      { t: tRes - 400, x: center(a)[0] + 60, y: center(a)[1] + 30 },
      { t: E - 600, x: center(b)[0] + 40, y: center(b)[1] },
      { t: E - 300, x: center(b)[0] + 40, y: center(b)[1], hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: inC[1] + 60, zoom: 1.0 },
      { t: tType - 500, cx: 195, cy: inC[1] + 90, zoom: 1.06 },
      { t: tRes, cx: 195, cy: center(a)[1] + 40, zoom: 1.06 },
      { t: Math.max(tRes + 800, E - 1200), cx: 195, cy: center(b)[1], zoom: 1.08 },
      { t: E, cx: 195, cy: center(b)[1] + 4, zoom: 1.08 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tType - 200, to: tRes - 450, rect: P.rects.input, label: spotA.label },
      { from: Math.max(tRes + 700, E - 1500), to: E - 250, rect: b, label: spotB.label },
    ];
    scenes.push({ id, kind: "screen", start: S, end: win[id].e, plate: id, states, camera, cursor, spots, headline: { text: headline, from: 60, to: Math.max(1400, r(lt[headlineEndLine].end) + 300) } });
  };
  searchScene("search1", "L2", "q", "rel", "first", { rect: "input", label: "Search it" }, { rect: "related", label: "Related cocktails" }, "Heard of a drink?", "L1");
  searchScene("search2", "L3", "q", "pr", "product", { rect: "input", label: "Product and brand" }, { rect: "brands", label: "Product and brand" }, "Or a bottle?", "L3");

  // ---- drink page ----
  {
    const P = plate("drink");
    const S = win.drink.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.drink.e - S;
    const tWhat = r(mt("L4", "what"));
    const tIng = r(mt("L4", "ing"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.title)[1] + 120, zoom: 1.0 },
      { t: tWhat - 300, cx: 195, cy: center(P.rects.what)[1] + 60, zoom: 1.05 },
      { t: tIng - 300, cx: 195, cy: center(P.rects.ingredients)[1] + 20, zoom: 1.07 },
      { t: E, cx: 195, cy: center(P.rects.how)[1] - 30, zoom: 1.07 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tWhat - 100, to: tIng - 350, rect: P.rects.what },
      { from: tIng - 150, to: E - 250, rect: P.rects.ingredients, label: "Ingredients" },
    ];
    scenes.push({ id: "drink", kind: "screen", start: S, end: win.drink.e, plate: "drink", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "What it is, how to make it", from: 60, to: Math.max(1500, tWhat - 100) } });
  }

  // ---- where it was seen ----
  {
    const P = plate("where");
    const S = win.where.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.where.e - S;
    const tV = r(mt("L5", "v"));
    const tSrc = r(mt("L5", "src"));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: center(P.rects.head)[1] + 140, zoom: 1.0 },
      { t: tV - 300, cx: 195, cy: center(P.rects.venue)[1] - 40, zoom: 1.05 },
      { t: tSrc - 300, cx: 195, cy: center(P.rects.source)[1] - 20, zoom: 1.08 },
      { t: E, cx: 195, cy: center(P.rects.source)[1] - 16, zoom: 1.08 },
    ], 220);
    const spots: SpotKey[] = [
      { from: tV - 120, to: tSrc - 350, rect: P.rects.venue },
      { from: tSrc - 150, to: E - 250, rect: P.rects.source, label: "Source and date" },
    ];
    scenes.push({ id: "where", kind: "screen", start: S, end: win.where.e, plate: "where", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Seen on a menu", from: 60, to: Math.max(1500, tV - 120) } });
  }

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "Find your next great drink.", button: TDP_CTA.text, url: TDP_CTA.display } });

  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of TDP_NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  const plates: Timeline["plates"] = {};
  for (const id of ["search1", "search2", "drink", "where"]) {
    const p = plate(id);
    plates[id] = { w: PLATE_CSS_W, h: p.h, states: Object.fromEntries(Object.entries(p.states).map(([k, s]) => [k, s.file])) };
  }
  return {
    timeline: { durationMs, brand: { name: "TheDrinkPlace", accent: "#ff4d8d", dark: "#05060a", light: "#f4f6fb", logo: manifest.logo, palette: { blobs: ["#ff4d8d", "#5b3bd6"], endFrom: "#ff4d8d", endMid: "#9a2d6b", endTo: "#05060a", button: "#d6336f", ripple: "rgba(255,77,141,.25)" } }, plates, scenes, captions },
    lineWords,
    scenes,
  };
}
