/**
 * The RentalNoodle pilot: script, claims, and the timeline that ties every action on screen to the word being spoken.
 * Everything shown is a real state of the public product; everything said traces to a verified Product Truth fact and a quote that is
 * on the captured page. Nothing here describes a feature the public pages do not describe.
 */
import { captionWordsFor, groupCaptions, parseSpoken, wordTimings } from "./audio";
import { PLATE_CSS_W, TRANSITION_MS, type CameraKey, type Claim, type CursorKey, type Manifest, type NarrationLine, type Rect, type SpotKey, type StageScene, type Timeline, type WordTime } from "./types";

export const TITLE = "RentalNoodle: free calculators to one simple place for every rental";
export const CTA = { text: "Start Managing Free", url: "https://rentalnoodle.com/sign-up?intent=owner&from=home", display: "rentalnoodle.com" };

export const NARRATION: NarrationLine[] = [
  { id: "L1", sceneId: "prorate", spoken: "Prorating rent for a mid-month move-in?", claims: ["c-prorate"] },
  { id: "L2", sceneId: "prorate", spoken: "Skip the spreadsheet. Type {rent}the rent and {dates}the dates, and Rental Noodle {math}shows the math.", caption: "Skip the spreadsheet. Type the rent and the dates, and RentalNoodle shows the math.", claims: ["c-nosheet", "c-formula"] },
  { id: "L3", sceneId: "rentinc", spoken: "Planning a rent increase? Enter the {pct}percent and see the {newrent}new rent.", claims: ["c-rentinc"] },
  { id: "L4", sceneId: "manage", spoken: "When you're ready, each rental gets one record: {tenant}tenant, {lease}lease, {rent}rent, {repairs}repairs, and {fin}finances.", claims: ["c-record"] },
  { id: "L5", sceneId: "pricing", spoken: "Start free with {one}one property, including {esign}electronic lease signing.", claims: ["c-free"] },
  { id: "L6", sceneId: "tenant", spoken: "Tenants get a free portal for their {lease}lease, {rent}rent, and {repairs}repairs.", claims: ["c-tenant"] },
  { id: "L7", sceneId: "end", spoken: "Start managing free, at Rental Noodle dot com.", caption: "Start managing free at RentalNoodle.com", claims: ["c-cta"] },
];

export const CLAIMS: Claim[] = [
  { id: "c-prorate", text: "RentalNoodle has a prorated rent calculator for mid-month move-ins.", facts: ["Mid-month move-in/out"], sources: [{ plate: "tools", quote: "Mid-month move-in/out" }, { plate: "prorate", quote: "Prorated rent calculator" }] },
  { id: "c-nosheet", text: "Using it replaces spreadsheet math (the landlord page says you stop juggling spreadsheets and email).", facts: ["stop juggling spreadsheets and email"], sources: [{ plate: "manage", quote: "so you stop juggling spreadsheets and email" }] },
  { id: "c-formula", text: "The calculator shows the formula and the result as you type.", facts: ["Formula: daily rate = monthly rent"], sources: [{ plate: "prorate", quote: "Formula: daily rate = monthly rent ÷ days in period; prorated amount = daily rate × days occupied (inclusive)." }, { plate: "prorate", quote: "Prorated rent:" }] },
  { id: "c-rentinc", text: "The rent increase calculator shows the new rent and the dollar and percentage change.", facts: ["Shows both dollar and percentage change"], sources: [{ plate: "rentinc", quote: "Shows both dollar and percentage change." }, { plate: "rentinc", quote: "New rent:" }] },
  { id: "c-record", text: "Each rental has one record connecting tenant, lease, rent, maintenance, documents, inspections and financials.", facts: ["One rental record connects tenant, lease, rent, maintenance, documents, inspections, and financials"], sources: [{ plate: "manage", quote: "One rental record connects tenant, lease, rent, maintenance, documents, inspections, and financials" }] },
  { id: "c-free", text: "The Free plan covers one property and includes lease upload, storage and electronic signing.", facts: ["Lease upload, storage, and electronic signing", "1 property", "Start free. Upgrade when you need more properties or tools."], sources: [{ plate: "pricing", quote: "Lease upload, storage, and electronic signing" }, { plate: "pricing", quote: "1 property" }, { plate: "pricing", quote: "Start free." }] },
  { id: "c-tenant", text: "Tenant portal access is always free and covers lease, rent and payment history, and maintenance requests.", facts: ["Tenant portal access is always free", "view your lease, check rent and payment history, report maintenance, track repairs"], sources: [{ plate: "tenant", quote: "Tenant portal access is always free." }, { plate: "tenant", quote: "view your lease, check rent and payment history, report maintenance, track repairs, and message your landlord" }] },
  { id: "c-hero", text: "RentalNoodle's landlord page describes it as one simple place for every rental.", facts: ["One simple place for every rental"], sources: [{ plate: "manage", quote: "One simple place for every rental." }] },
  { id: "c-cta", text: "The site's call to action is Start Managing Free.", facts: ["Start Managing Free"], sources: [{ plate: "manage", quote: "Start Managing Free" }] },
];

/** Product Truth facts this video needs beyond the existing set. Each is added only if its exact text is on the live page it cites. */
export const DEMO_FACTS: Array<{ plate: string; value: string }> = [
  { plate: "tools", value: "Mid-month move-in/out with actual-days or 30-day conventions exposed." },
  { plate: "prorate", value: "Formula: daily rate = monthly rent ÷ days in period; prorated amount = daily rate × days occupied (inclusive)." },
  { plate: "rentinc", value: "Shows both dollar and percentage change." },
  { plate: "manage", value: "One rental record connects tenant, lease, rent, maintenance, documents, inspections, and financials — so you stop juggling spreadsheets and email." },
  { plate: "manage", value: "One simple place for every rental." },
  { plate: "pricing", value: "Lease upload, storage, and electronic signing" },
  { plate: "tenant", value: "Tenant portal access is always free." },
  { plate: "tenant", value: "view your lease, check rent and payment history, report maintenance, track repairs, and message your landlord" },
];

/** Every string on screen other than the captioned voice, with the claim behind it. */
export const ON_SCREEN: Array<{ sceneId: string; kind: "headline" | "label" | "cta"; text: string; claim: string }> = [
  { sceneId: "prorate", kind: "headline", text: "Mid-month move-in?", claim: "c-prorate" },
  { sceneId: "prorate", kind: "label", text: "Live result", claim: "c-formula" },
  { sceneId: "rentinc", kind: "headline", text: "Rent increase?", claim: "c-rentinc" },
  { sceneId: "rentinc", kind: "label", text: "New rent", claim: "c-rentinc" },
  { sceneId: "manage", kind: "headline", text: "One record per rental", claim: "c-record" },
  { sceneId: "manage", kind: "label", text: "Tenant", claim: "c-record" },
  { sceneId: "manage", kind: "label", text: "Lease", claim: "c-record" },
  { sceneId: "manage", kind: "label", text: "Rent", claim: "c-record" },
  { sceneId: "manage", kind: "label", text: "Maintenance", claim: "c-record" },
  { sceneId: "manage", kind: "label", text: "Finances", claim: "c-record" },
  { sceneId: "pricing", kind: "headline", text: "Start free", claim: "c-free" },
  { sceneId: "pricing", kind: "label", text: "Free", claim: "c-free" },
  { sceneId: "pricing", kind: "label", text: "1 property", claim: "c-free" },
  { sceneId: "pricing", kind: "label", text: "Electronic signing", claim: "c-free" },
  { sceneId: "tenant", kind: "headline", text: "Free tenant portal", claim: "c-tenant" },
  { sceneId: "tenant", kind: "label", text: "Always free", claim: "c-tenant" },
  { sceneId: "end", kind: "headline", text: "One simple place for every rental.", claim: "c-hero" },
  { sceneId: "end", kind: "cta", text: "Start Managing Free", claim: "c-cta" },
];

export const SCENE_META: Record<string, { plate?: string; purpose: string; motion: string[]; note: string }> = {
  prorate: { plate: "prorate", purpose: "Hook and first demonstration: the real prorated rent calculator, typed into live.", motion: ["touch cursor moves and taps the rent field", "rent typed digit by digit, result updates live", "start day changed, result updates again", "camera pushes in on the inputs, then the result", "focus highlight on the live result"], note: "Real states of the public calculator, produced by typing 2150 and changing the start day on the live page." },
  rentinc: { plate: "rentinc", purpose: "Second tool: the real rent increase calculator.", motion: ["cursor taps the percent field, value changes to 8", "cursor taps the rent field, value changes to 1850", "camera push on the result", "focus highlight on the new rent"], note: "Real states of the public rent increase calculator after changing the percent and the rent." },
  manage: { plate: "manage", purpose: "The product: one record per rental connecting tenant, lease, rent, maintenance and finances.", motion: ["camera scrolls down the real landlord page", "focus highlight steps through tenant, lease, rent, maintenance and finances as each is spoken", "a label pops in on each highlighted tile"], note: "Real capture of the 'one rental record connects everything' section of rentalnoodle.com/manage." },
  pricing: { plate: "pricing", purpose: "Proof of what the free plan includes, including electronic lease signing.", motion: ["camera pushes in on the Free plan", "cursor moves between the property count and the e-signing line", "focus highlights on each"], note: "Real capture of the Free plan card on rentalnoodle.com/pricing." },
  tenant: { plate: "tenant", purpose: "The tenant side: a free portal for lease, rent and repairs.", motion: ["camera scrolls the real tenant portal page", "focus highlights on lease, rent, maintenance, then the always-free statement", "a label pops in on each highlight"], note: "Real capture of the tenant portal section of rentalnoodle.com/tenant." },
  end: { purpose: "Call to action.", motion: ["logo and headline spring in", "call to action button pulses"], note: "Branded end card; no product screen is claimed." },
};

// ---- timing ------------------------------------------------------------------------------------------------------------------------

export type LineTime = { start: number; end: number; durMs: number };

/** Extra time the last product scene stays up after its voice line, and the matching lead-in before the closing line. */
const TENANT_TAIL_MS = 1300;
const END_LEAD_MS = 1350;

/** Places the voiced lines on the timeline: a short pause inside a scene, a longer one between scenes. */
export function layoutLines(durMs: Record<string, number>): Record<string, LineTime> {
  const out: Record<string, LineTime> = {};
  let t = 300;
  NARRATION.forEach((l, i) => {
    // The closing line waits longer so the last product highlight ("always free") has time to land before the end card.
    if (i > 0) t += l.sceneId === NARRATION[i - 1].sceneId ? 300 : l.sceneId === "end" ? END_LEAD_MS : 450;
    const d = durMs[l.id];
    if (!d) throw new Error(`no audio duration for line ${l.id}`);
    out[l.id] = { start: t, end: t + d, durMs: d };
    t += d;
  });
  return out;
}

const center = (r: Rect): [number, number] => [r[0] + r[2] / 2, r[1] + r[3] / 2];

/** Keeps keyframes strictly increasing so every move has time to play. */
function ascending<T extends { t: number }>(keys: T[], gap = 140): T[] {
  const out: T[] = [];
  for (const k of keys.sort((a, b) => a.t - b.t)) {
    const prev = out[out.length - 1];
    out.push(prev && k.t < prev.t + gap ? { ...k, t: prev.t + gap } : k);
  }
  return out;
}

export type BuiltDemo = { timeline: Timeline; lineWords: Record<string, WordTime[]>; scenes: StageScene[] };

export function buildTimeline(manifest: Manifest, lt: Record<string, LineTime>): BuiltDemo {
  const plate = (id: string) => manifest.plates[id];
  const lineBy = Object.fromEntries(NARRATION.map((l) => [l.id, l]));
  const parsed = Object.fromEntries(NARRATION.map((l) => [l.id, parseSpoken(l.spoken)]));
  const spokenWords: Record<string, WordTime[]> = Object.fromEntries(NARRATION.map((l) => [l.id, wordTimings(parsed[l.id].words, lt[l.id].durMs)]));
  /** Absolute time of the word a marker points at. */
  const mt = (line: string, marker: string) => {
    const idx = parsed[line].markers[marker];
    if (idx === undefined) throw new Error(`marker ${marker} missing in ${line}`);
    return lt[line].start + spokenWords[line][idx].from;
  };

  // scene windows from the voice
  const order = ["prorate", "rentinc", "manage", "pricing", "tenant"];
  const lastEnd = (scene: string) => Math.max(...NARRATION.filter((l) => l.sceneId === scene).map((l) => lt[l.id].end));
  const win: Record<string, { s: number; e: number }> = {};
  order.forEach((id, i) => {
    const s = i === 0 ? 0 : win[order[i - 1]].e - TRANSITION_MS;
    win[id] = { s, e: lastEnd(id) + (id === "tenant" ? TENANT_TAIL_MS : 400) };
  });
  const endStart = win.tenant.e - TRANSITION_MS;
  const durationMs = lt.L7.end + 1500;

  const scenes: StageScene[] = [];

  // ---- prorate ----
  {
    const P = plate("prorate");
    const S = win.prorate.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const rentC = center(P.rects.rent);
    const dayC = center(P.rects.startDay);
    const resC = center(P.rects.result);
    const tapRent = r(mt("L2", "rent")) - 150;
    const tapDay = r(mt("L2", "dates")) - 120;
    const math = r(mt("L2", "math"));
    const E = win.prorate.e - S;
    const states = [{ at: 0, state: "s0" }, { at: tapRent + 170, state: "t2" }, { at: tapRent + 330, state: "t21" }, { at: tapRent + 490, state: "t215" }, { at: tapRent + 650, state: "t2150" }, { at: tapDay + 260, state: "d20" }];
    const cursor: CursorKey[] = ascending([
      { t: 250, x: 330, y: 250 },
      { t: tapRent - 260, x: rentC[0] + 24, y: rentC[1] },
      { t: tapRent, x: rentC[0] + 24, y: rentC[1], tap: true },
      { t: tapDay - 380, x: dayC[0] + 24, y: dayC[1] },
      { t: tapDay, x: dayC[0] + 24, y: dayC[1], tap: true },
      { t: math - 120, x: resC[0] + 120, y: resC[1] + 8 },
      { t: E - 300, x: resC[0] + 120, y: resC[1] + 8, hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 400, zoom: 1.0 },
      { t: tapRent - 520, cx: 195, cy: 430, zoom: 1.07 },
      { t: math - 380, cx: 195, cy: 540, zoom: 1.1 },
      { t: E, cx: 195, cy: 545, zoom: 1.1 },
    ], 200);
    const spots: SpotKey[] = [{ from: math - 120, to: E - 250, rect: P.rects.result, label: "Live result" }];
    scenes.push({ id: "prorate", kind: "screen", start: S, end: win.prorate.e, plate: "prorate", states, camera, cursor, spots, headline: { text: "Mid-month move-in?", from: 60, to: r(lt.L1.end) + 260 } });
  }

  // ---- rent increase ----
  {
    const P = plate("rentinc");
    const S = win.rentinc.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const pctC = center(P.rects.pct);
    const rentC = center(P.rects.rent);
    const resC = center(P.rects.result);
    const tapPct = r(mt("L3", "pct")) - 420;
    const nr = r(mt("L3", "newrent"));
    const tapRent = nr + 120;
    const E = win.rentinc.e - S;
    const states = [{ at: 0, state: "s0" }, { at: tapPct + 280, state: "p8" }, { at: tapRent + 260, state: "r1850" }];
    const cursor: CursorKey[] = ascending([
      { t: 200, x: 320, y: 230 },
      { t: tapPct - 300, x: pctC[0] + 20, y: pctC[1] },
      { t: tapPct, x: pctC[0] + 20, y: pctC[1], tap: true },
      { t: tapRent - 330, x: rentC[0] + 20, y: rentC[1] },
      { t: tapRent, x: rentC[0] + 20, y: rentC[1], tap: true },
      { t: E - 260, x: resC[0] + 150, y: resC[1] + 4, hide: true },
    ]);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 380, zoom: 1.0 },
      { t: tapPct - 380, cx: 195, cy: 420, zoom: 1.07 },
      { t: nr - 100, cx: 195, cy: 455, zoom: 1.1 },
      { t: E, cx: 195, cy: 458, zoom: 1.1 },
    ], 200);
    scenes.push({ id: "rentinc", kind: "screen", start: S, end: win.rentinc.e, plate: "rentinc", states, camera, cursor, spots: [{ from: tapRent + 220, to: E - 240, rect: P.rects.result, label: "New rent" }], headline: { text: "Rent increase?", from: 60, to: r(lt.L3.start) + 1700 } });
  }

  // ---- one record per rental ----
  {
    const P = plate("manage");
    const S = win.manage.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.manage.e - S;
    const tiles: Array<[string, string, string]> = [["tenant", "tenant", "Tenant"], ["lease", "lease", "Lease"], ["rent", "rent", "Rent"], ["repairs", "maintenance", "Maintenance"], ["fin", "finances", "Finances"]];
    const times = tiles.map(([m]) => r(mt("L4", m)));
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 250, zoom: 1.0 },
      ...tiles.map(([, rect], i) => ({ t: times[i] - 120, cx: 195, cy: center(P.rects[rect])[1], zoom: 1.04 })),
      { t: E, cx: 195, cy: center(P.rects.finances)[1], zoom: 1.04 },
    ], 220);
    const spots: SpotKey[] = tiles.map(([, rect, label], i) => ({ from: times[i] - 160, to: i + 1 < tiles.length ? times[i + 1] - 140 : E - 300, rect: P.rects[rect], label }));
    scenes.push({ id: "manage", kind: "screen", start: S, end: win.manage.e, plate: "manage", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "One record per rental", from: 60, to: Math.max(1500, times[0] - 120) } });
  }

  // ---- pricing ----
  {
    const P = plate("pricing");
    const S = win.pricing.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.pricing.e - S;
    const one = r(mt("L5", "one"));
    const es = r(mt("L5", "esign"));
    const propC = center(P.rects.property);
    const esC = center(P.rects.esign);
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 300, zoom: 1.0 },
      { t: one - 120, cx: 195, cy: propC[1] + 20, zoom: 1.07 },
      { t: es - 120, cx: 195, cy: esC[1] + 10, zoom: 1.1 },
      { t: E, cx: 195, cy: esC[1] + 10, zoom: 1.1 },
    ], 220);
    const cursor: CursorKey[] = ascending([
      { t: 380, x: 340, y: 150 },
      { t: one - 280, x: propC[0] + 130, y: propC[1] },
      { t: es - 300, x: esC[0] + 150, y: esC[1] },
      { t: E - 320, x: esC[0] + 150, y: esC[1], hide: true },
    ]);
    const spots: SpotKey[] = [
      { from: 420, to: Math.max(900, one - 200), rect: P.rects.price, label: "Free" },
      { from: one - 180, to: Math.max(one + 400, es - 160), rect: P.rects.property, label: "1 property" },
      { from: es - 140, to: E - 280, rect: P.rects.esign, label: "Electronic signing" },
    ];
    scenes.push({ id: "pricing", kind: "screen", start: S, end: win.pricing.e, plate: "pricing", states: [{ at: 0, state: "s0" }], camera, cursor, spots, headline: { text: "Start free", from: 60, to: r(lt.L5.start) + 1100 } });
  }

  // ---- tenant portal ----
  {
    const P = plate("tenant");
    const S = win.tenant.s;
    const r = (abs: number) => Math.max(0, abs - S);
    const E = win.tenant.e - S;
    const a = r(mt("L6", "lease"));
    const b = r(mt("L6", "rent"));
    const c = r(mt("L6", "repairs"));
    const freeAt = c + 650;
    const camera: CameraKey[] = ascending([
      { t: 0, cx: 195, cy: 230, zoom: 1.0 },
      { t: a - 120, cx: 195, cy: center(P.rects.lease)[1], zoom: 1.04 },
      { t: b - 120, cx: 195, cy: center(P.rects.rent)[1], zoom: 1.04 },
      { t: c - 120, cx: 195, cy: center(P.rects.maintenance)[1], zoom: 1.04 },
      { t: freeAt - 120, cx: 195, cy: center(P.rects.free)[1], zoom: 1.06 },
      { t: E, cx: 195, cy: center(P.rects.free)[1], zoom: 1.06 },
    ], 220);
    const spots: SpotKey[] = [
      { from: a - 150, to: b - 150, rect: P.rects.lease, label: "View your lease" },
      { from: b - 130, to: c - 150, rect: P.rects.rent, label: "Rent history" },
      { from: c - 130, to: freeAt - 120, rect: P.rects.maintenance, label: "Repairs" },
      { from: freeAt - 60, to: E - 320, rect: P.rects.free, label: "Always free" },
    ];
    scenes.push({ id: "tenant", kind: "screen", start: S, end: win.tenant.e, plate: "tenant", states: [{ at: 0, state: "s0" }], camera, spots, headline: { text: "Free tenant portal", from: 60, to: Math.max(1500, a - 100) } });
  }

  scenes.push({ id: "end", kind: "end", start: endStart, end: durationMs, end_card: { headline: "One simple place for every rental.", button: CTA.text, url: CTA.display } });

  // ---- captions ----
  const lineWords: Record<string, WordTime[]> = {};
  const captions: Timeline["captions"] = [];
  for (const l of NARRATION) {
    const words = l.caption ? wordTimings(captionWordsFor(l), lt[l.id].durMs) : spokenWords[l.id];
    lineWords[l.id] = spokenWords[l.id];
    captions.push(...groupCaptions(words, lt[l.id].start));
  }
  void lineBy;

  const plates: Timeline["plates"] = {};
  for (const id of order) {
    const p = plate(id);
    plates[id] = { w: PLATE_CSS_W, h: p.h, states: Object.fromEntries(Object.entries(p.states).map(([k, s]) => [k, s.file])) };
  }
  return {
    timeline: { durationMs, brand: { name: "RentalNoodle", accent: "#f97316", dark: "#0f172a", light: "#fff7ed", logo: manifest.logo }, plates, scenes, captions },
    lineWords,
    scenes,
  };
}
